import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import { looksLikeBounce, readBounce } from './bounces';

/** How often the inbox is read for new delivery reports. */
const EVERY_MS = 3 * 60_000;
/** Where the reading got to: "<uidValidity>:<last uid>". */
const CURSOR_KEY = 'mail.bounces.cursor';
/** A report bigger than this is not a bounce worth reading whole. */
const MAX_SOURCE = 400_000;

/**
 * Finds out which emails the receiving server (Gmail, Outlook, ...) refused
 * after our mail server had accepted them. Those refusals come back as
 * delivery reports to the mailbox that sends (SMTP_USER); this reads that
 * inbox over IMAP every few minutes, without marking or moving anything, and
 * turns the matching log rows into BOUNCED with the server's reason.
 */
@Injectable()
export class BounceService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Bounces');
  private readonly imap: {
    host: string;
    port: number;
    user: string;
    pass: string;
  } | null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private state: {
    ok: boolean | null;
    at: Date | null;
    error: string | null;
    found: number;
  } = { ok: null, at: null, error: null, found: 0 };

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // The same mailbox as SMTP by default; IMAP_* only when it differs.
    const host =
      config.get<string>('IMAP_HOST') || config.get<string>('SMTP_HOST');
    const user =
      config.get<string>('IMAP_USER') || config.get<string>('SMTP_USER');
    const pass =
      config.get<string>('IMAP_PASS') || config.get<string>('SMTP_PASS');
    const off = /^(off|false|0|no)$/i.test(
      config.get<string>('IMAP_BOUNCES') ?? '',
    );
    this.imap =
      host && user && pass && !off
        ? {
            host,
            user,
            pass,
            port: Number(config.get<string>('IMAP_PORT') || 993),
          }
        : null;
  }

  onModuleInit() {
    if (!this.imap) return;
    // A first look shortly after start, then every few minutes.
    this.timer = setTimeout(() => this.loop(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private loop() {
    void this.check().finally(() => {
      if (this.timer) this.timer = setTimeout(() => this.loop(), EVERY_MS);
    });
  }

  /** For the admin panel. */
  status() {
    return {
      enabled: Boolean(this.imap),
      host: this.imap ? `${this.imap.host}:${this.imap.port}` : '',
      user: this.imap?.user ?? '',
      ...this.state,
    };
  }

  /** Read the inbox now; runs once at a time. */
  async check() {
    if (!this.imap) return this.status();
    this.running ??= this.read().finally(() => {
      this.running = null;
    });
    await this.running;
    return this.status();
  }

  private async read() {
    const imap = this.imap;
    if (!imap) return;
    const client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.port === 993,
      auth: { user: imap.user, pass: imap.pass },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
    // An idle connection that drops later must not crash the app.
    client.on('error', (err: Error) => this.log.warn(`IMAP: ${err.message}`));
    try {
      await client.connect();
      const found = await this.readInbox(client);
      this.state = {
        ok: true,
        at: new Date(),
        error: null,
        found: this.state.found + found,
      };
      await client.logout();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state = {
        ...this.state,
        ok: false,
        at: new Date(),
        error: message.slice(0, 300),
      };
      this.log.warn(`Could not read ${imap.user} for bounces: ${message}`);
      client.close();
    }
  }

  /** New messages since the last look; returns how many emails bounced. */
  private async readInbox(client: ImapFlow): Promise<number> {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const box = client.mailbox;
      if (!box) return 0;
      const validity = String(box.uidValidity);
      const saved = await this.cursor();
      let from: number;
      if (saved && saved.validity === validity) {
        from = saved.uid + 1;
      } else {
        // First look (or the mailbox was rebuilt): the last three days only.
        const recent = await client.search(
          { since: new Date(Date.now() - 3 * 86_400_000) },
          { uid: true },
        );
        from = recent && recent.length ? Math.min(...recent) : box.uidNext;
      }

      let last = from - 1;
      const reports: number[] = [];
      // "n:*" on an IMAP server always includes the newest message, even
      // below n, hence the uidNext check and the uid filter.
      if (from < box.uidNext) {
        for await (const msg of client.fetch(
          `${from}:*`,
          { uid: true, envelope: true, size: true },
          { uid: true },
        )) {
          if (msg.uid < from) continue;
          last = Math.max(last, msg.uid);
          if (looksLikeBounce(msg.envelope) && (msg.size ?? 0) <= MAX_SOURCE) {
            reports.push(msg.uid);
          }
        }
      }

      let bounced = 0;
      for (const uid of reports) {
        const msg = await client.fetchOne(
          String(uid),
          { source: true },
          { uid: true },
        );
        if (!msg || !msg.source) continue;
        bounced += await this.apply(
          msg.source.toString('utf8'),
          msg.internalDate,
        );
      }
      await this.saveCursor(
        validity,
        Math.max(last, saved?.validity === validity ? saved.uid : 0),
      );
      return bounced;
    } finally {
      lock.release();
    }
  }

  /** One delivery report onto the log; returns the rows it changed. */
  private async apply(
    source: string,
    receivedAt?: Date | string,
  ): Promise<number> {
    const report = readBounce(source);
    if (!report) return 0;
    const error = report.permanent
      ? `Refused by the receiving server: ${report.reason}`
      : `Delayed (the mail server keeps trying): ${report.reason}`;
    const data = report.permanent
      ? { status: 'BOUNCED', error, bouncedAt: new Date() }
      : { error };

    if (report.ids.length) {
      const { count } = await this.prisma.emailLog.updateMany({
        where: {
          OR: report.ids.map((id) => ({ messageId: { contains: id } })),
          status: { not: 'BOUNCED' },
        },
        data,
      });
      if (count) return report.permanent ? count : 0;
    }
    // A report that does not quote our Message-ID: the latest email to that
    // address in the three days before the report.
    if (!report.recipient) return 0;
    const before = receivedAt ? new Date(receivedAt) : new Date();
    const row = await this.prisma.emailLog.findFirst({
      where: {
        to: { equals: report.recipient, mode: 'insensitive' },
        status: 'SENT',
        createdAt: {
          lte: before,
          gte: new Date(before.getTime() - 3 * 86_400_000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return 0;
    await this.prisma.emailLog.update({ where: { id: row.id }, data });
    return report.permanent ? 1 : 0;
  }

  private async cursor(): Promise<{ validity: string; uid: number } | null> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: CURSOR_KEY },
    });
    const [validity, uid] = (row?.value ?? '').split(':');
    return validity && Number(uid) >= 0 ? { validity, uid: Number(uid) } : null;
  }

  private async saveCursor(validity: string, uid: number) {
    const value = `${validity}:${uid}`;
    await this.prisma.appSetting.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value },
      update: { value },
    });
  }
}
