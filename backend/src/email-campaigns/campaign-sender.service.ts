import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { EmailCampaignsService } from './email-campaigns.service';

const TICK_MS = 5_000;
const LOCK = 'email-campaigns:sender';
/** After the mail server says "not now" or cannot be reached. */
const BACK_OFF_MS = 60_000;
/** An address the receiving server said "try later" for waits this long... */
const RETRY_AFTER_MS = 5 * 60_000;
/** ...and fails after this many tries. */
const MAX_TRIES = 5;

/**
 * Sends campaigns in the background, oldest first, a few emails every five
 * seconds at the chosen speed (emails a minute), so a big list neither
 * floods the mail server nor holds up the admin panel.
 *
 * Each email is claimed (QUEUED -> SENDING) before it goes, so it is never
 * sent twice. When our mail server cannot be reached, the email goes back
 * in the queue and sending waits a minute, instead of marking the whole
 * list failed. When a server says "try later" about one address, sending
 * also pauses a minute (it is often a rate limit), that address waits five
 * minutes behind the rest, and fails after five tries. A stopped campaign
 * stops between emails.
 */
@Injectable()
export class CampaignSender implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CampaignSender.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  /** Emails this process may send now; fills up at the chosen speed. */
  private budget = 1;
  private lastTick = Date.now();
  private pausedUntil = 0;
  private recoveredAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly campaigns: EmailCampaignsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // One sender at a time, even with several backend processes.
      if (!(await this.redis.setIfAbsent(LOCK, 120))) return;
      try {
        await this.run();
      } finally {
        await this.redis.del(LOCK);
      }
    } catch (err) {
      this.log.warn(`Campaign sending hit a problem: ${message(err)}`);
    } finally {
      this.busy = false;
    }
  }

  /** One round: recover stuck emails, then send what the speed allows. */
  async run(now = Date.now()) {
    await this.recover(now);
    const perMinute = await this.campaigns.rate();
    // Earned since the last round, at most ten seconds' worth at once.
    this.budget = Math.min(
      this.budget + ((now - this.lastTick) / 60_000) * perMinute,
      Math.max(1, perMinute / 6),
    );
    this.lastTick = now;
    if (now < this.pausedUntil || !this.mail.ready) return;

    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { status: 'SENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (!campaign) return;

    const take = Math.floor(this.budget);
    if (take < 1) return;
    const queued = await this.prisma.emailDelivery.findMany({
      where: {
        campaignId: campaign.id,
        status: 'QUEUED',
        // Not an address still waiting to be tried again.
        OR: [
          { attemptedAt: null },
          { attemptedAt: { lt: new Date(now - RETRY_AFTER_MS) } },
        ],
      },
      orderBy: [
        { attemptedAt: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
      take,
    });
    if (!queued.length) {
      await this.finishIfDone(campaign.id);
      return;
    }
    const off = new Set(
      (
        await this.prisma.emailSuppression.findMany({
          where: { email: { in: queued.map((d) => d.email) } },
          select: { email: true },
        })
      ).map((s) => s.email),
    );

    for (const delivery of queued) {
      const current = await this.prisma.emailCampaign.findUnique({
        where: { id: campaign.id },
        select: { status: true },
      });
      if (current?.status !== 'SENDING') return;

      const claimed = await this.prisma.emailDelivery.updateMany({
        where: { id: delivery.id, status: 'QUEUED' },
        data: { status: 'SENDING', attemptedAt: new Date() },
      });
      if (!claimed.count) continue;
      this.budget -= 1;

      if (off.has(delivery.email)) {
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SKIPPED', error: 'Unsubscribed.' },
        });
        continue;
      }
      try {
        const messageId = await this.campaigns.deliver(campaign, delivery);
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', messageId, sentAt: new Date(), error: null },
        });
        if (campaign.lastError) {
          campaign.lastError = null;
          await this.prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: { lastError: null },
          });
        }
      } catch (err) {
        if (isTemporary(err)) {
          const ours = isServerDown(err);
          // Our own server being down is not this address's fault.
          const attempts = delivery.attempts + (ours ? 0 : 1);
          const text = message(err).slice(0, 400);
          if (!ours && attempts >= MAX_TRIES) {
            await this.prisma.emailDelivery.update({
              where: { id: delivery.id },
              data: {
                status: 'FAILED',
                attempts,
                error: `Refused ${attempts} times: ${text}`,
              },
            });
          } else {
            await this.prisma.emailDelivery.update({
              where: { id: delivery.id },
              data: {
                status: 'QUEUED',
                attempts,
                error: text,
                // The server: first in line again. An address: to the back.
                attemptedAt: ours ? null : new Date(now),
              },
            });
            await this.prisma.emailCampaign.update({
              where: { id: campaign.id },
              data: {
                lastError: ours
                  ? `${text} - trying again in a minute.`
                  : `${delivery.email}: ${text} - trying it again in a few minutes; the rest carry on after a short pause.`,
              },
            });
          }
          this.pausedUntil = now + BACK_OFF_MS;
          return;
        }
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', error: message(err).slice(0, 500) },
        });
      }
    }
  }

  /** Sent when nobody is left: none being sent, none waiting to be tried again. */
  private async finishIfDone(campaignId: string) {
    const left = await this.prisma.emailDelivery.count({
      where: { campaignId, status: { in: ['QUEUED', 'SENDING'] } },
    });
    if (left) return;
    await this.prisma.emailCampaign.updateMany({
      where: { id: campaignId, status: 'SENDING' },
      data: { status: 'SENT', finishedAt: new Date(), lastError: null },
    });
  }

  /**
   * An email claimed ten minutes ago and never finished: the server
   * restarted mid-send. It may have gone out, so it is not sent again.
   */
  private async recover(now: number) {
    if (now - this.recoveredAt < 60_000) return;
    this.recoveredAt = now;
    await this.prisma.emailDelivery.updateMany({
      where: {
        status: 'SENDING',
        attemptedAt: { lt: new Date(now - 10 * 60_000) },
      },
      data: {
        status: 'FAILED',
        error:
          'Interrupted while sending (the server restarted); it may or may not have gone out.',
      },
    });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SERVER_DOWN = [
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'EAUTH',
  'ETLS',
  'ECONNRESET',
];

/** Our mail server could not be reached or refused our login. */
export function isServerDown(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    (typeof code === 'string' && SERVER_DOWN.includes(code)) ||
    /SMTP is not set up/.test(message(err))
  );
}

/**
 * Worth trying again: our mail server is down (above), or a server said
 * "not now" (4xx). A 5xx answer about the recipient is final.
 */
export function isTemporary(err: unknown): boolean {
  if (isServerDown(err)) return true;
  const status = (err as { responseCode?: unknown } | null)?.responseCode;
  return typeof status === 'number' && status >= 400 && status < 500;
}
