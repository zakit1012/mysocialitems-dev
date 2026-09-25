import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BillingService } from '../billing/billing.service';
import { statDay } from '../analytics/analytics.service';
import { placeHoursKey } from './reviews-engine.service';

const SYNC_EVERY_MS = 30 * 60 * 1000;
const FIRST_SYNC_AFTER_MS = 60 * 1000;
// A widget nobody has loaded for this long stops being refreshed. The next
// view wakes it again (the engine re-registers a place on every request).
const ACTIVE_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Tells the review engine which places are still in use and how often each
 * one should refresh. A place's cadence is the fastest plan among the widgets
 * showing it; places nobody uses (or nobody has loaded for two weeks) are
 * left out, so the engine stops scraping them.
 *
 * Runs only in production, or with ENGINE_SYNC=true: a dev backend usually
 * points at the production engine, and syncing a dev database there would
 * switch off every real customer's widget.
 */
@Injectable()
export class EngineSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(EngineSyncService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
  ) {}

  onApplicationBootstrap() {
    const flag = this.config.get<string>('ENGINE_SYNC');
    const on =
      flag === 'true' ||
      (flag !== 'false' && process.env.NODE_ENV === 'production');
    if (!on) {
      this.log.log('Engine sync is off (not production, ENGINE_SYNC unset).');
      return;
    }
    const run = () => void this.sync();
    this.timers.push(setTimeout(run, FIRST_SYNC_AFTER_MS).unref());
    this.timers.push(setInterval(run, SYNC_EVERY_MS).unref());
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  /** Hours between refreshes for every place that should keep refreshing. */
  async placeHours(): Promise<Map<string, number>> {
    const since = new Date(Date.now() - ACTIVE_DAYS * DAY_MS);
    // Domains that loaded a widget lately. This predates the daily stats, so
    // widgets in use before those existed are not paused on the first sync.
    const seen = await this.prisma.source.findMany({
      where: { lastSeen: { gte: since } },
      select: { userId: true, widgetId: true },
    });
    const seenWidgets = new Set(seen.map((s) => s.widgetId).filter(Boolean));
    // An account-wide domain serves every widget of that account.
    const seenAccounts = new Set(
      seen.filter((s) => !s.widgetId).map((s) => s.userId),
    );

    const widgets = await this.prisma.widget.findMany({
      select: {
        id: true,
        placeId: true,
        userId: true,
        createdAt: true,
        stats: {
          where: {
            day: { gte: statDay(since) },
            OR: [{ loads: { gt: 0 } }, { missed: { gt: 0 } }],
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    const planHours = new Map<string, number>();
    const hours = new Map<string, number>();
    for (const w of widgets) {
      // Just created (the owner may not have installed it yet) or seen lately.
      const active =
        w.createdAt >= since ||
        w.stats.length > 0 ||
        seenWidgets.has(w.id) ||
        seenAccounts.has(w.userId);
      if (!active) continue;
      let h = planHours.get(w.userId);
      if (h === undefined) {
        h = (await this.billing.planFor(w.userId)).refreshHours;
        planHours.set(w.userId, h);
      }
      hours.set(w.placeId, Math.min(hours.get(w.placeId) ?? h, h));
    }
    return hours;
  }

  async sync() {
    // More than one backend process: only one of them syncs each round.
    if (!(await this.redis.setIfAbsent('engine-sync:lock', 25 * 60))) return;
    try {
      const hours = await this.placeHours();
      const base = (
        this.config.get<string>('REVIEW_ENGINE_URL') ??
        'https://reviewengine.zedcircle.com'
      ).replace(/\/+$/, '');
      const res = await fetch(`${base}/widgets/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          // placeIds keeps an engine without per-place cadence working (12h each).
          placeIds: [...hours.keys()],
          widgets: [...hours].map(([placeId, refreshHours]) => ({
            placeId,
            refreshHours,
          })),
        }),
      });
      if (!res.ok) throw new Error(`engine answered ${res.status}`);
      // The embed holds a cheaper plan's snapshot when the place refreshes faster.
      await Promise.all(
        [...hours].map(([placeId, h]) =>
          this.redis.setJson(placeHoursKey(placeId), h, 2 * 3600),
        ),
      );
      const result = (await res.json()) as {
        deactivated?: string[];
        added?: string[];
      };
      this.log.log(
        `Engine sync: ${hours.size} places active, ` +
          `${result.added?.length ?? 0} added, ${result.deactivated?.length ?? 0} paused.`,
      );
    } catch (err) {
      this.log.error(`Engine sync failed: ${String(err)}`);
    }
  }
}
