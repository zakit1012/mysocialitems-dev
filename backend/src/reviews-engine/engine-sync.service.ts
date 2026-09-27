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
import type { Plan } from '../billing/plans';
import { isPaidPlan } from '../billing/plans';
import { statDay } from '../analytics/analytics.service';
import { normalizeSettings } from '../widgets/widget-settings';
import { HIGHEST_RATED, widgetOrder } from '../widgets/review-picker';
import { placeHoursKey } from './reviews-engine.service';

const SYNC_EVERY_MS = 30 * 60 * 1000;
const FIRST_SYNC_AFTER_MS = 60 * 1000;
// A widget nobody has loaded for this long stops being refreshed. The next
// view wakes it again (the engine re-registers a place on every request).
const ACTIVE_DAYS = 14;
const DAY_MS = 86_400_000;
// Reviews the engine keeps per order: a Free widget shows 3 of 10, a paid
// one filters and picks from 50.
const FREE_REVIEWS = 10;
const PAID_REVIEWS = 50;
// A paid place's highest-rated list, used to top up its own order, changes
// slowly: every 15 days is enough.
const FILL_HOURS = 15 * 24;

/** One order of one place: how often it refreshes and how many reviews it keeps. */
type SortPlan = { hours: number; count: number };

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

  /**
   * Every place that should keep refreshing, with each order it is shown in.
   * A Free widget needs the highest-rated 10 at its plan's pace; a paid one
   * its own order's 50 at its plan's pace, plus the highest-rated 50 every
   * 15 days to top up from. Widgets sharing a place share its lists: each
   * order refreshes as fast, and keeps as many, as the most demanding one.
   */
  async placePlans(): Promise<Map<string, Map<string, SortPlan>>> {
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
        settings: true,
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

    const accounts = new Map<string, { plan: Plan; covered: Set<string> }>();
    const places = new Map<string, Map<string, SortPlan>>();
    for (const w of widgets) {
      // Just created (the owner may not have installed it yet) or seen lately.
      const active =
        w.createdAt >= since ||
        w.stats.length > 0 ||
        seenWidgets.has(w.id) ||
        seenAccounts.has(w.userId);
      if (!active) continue;
      let account = accounts.get(w.userId);
      if (!account) {
        const cover = await this.billing.coverage(w.userId);
        account = { plan: cover.plan, covered: cover.widgets };
        accounts.set(w.userId, account);
      }
      // Paused by the plan's widget limit: nobody sees it, so no refreshes.
      if (!account.covered.has(w.id)) continue;

      const sorts = places.get(w.placeId) ?? new Map<string, SortPlan>();
      const need = (sort: string, hours: number, count: number) => {
        const had = sorts.get(sort);
        sorts.set(
          sort,
          had
            ? {
                hours: Math.min(had.hours, hours),
                count: Math.max(had.count, count),
              }
            : { hours, count },
        );
      };
      const paid = isPaidPlan(account.plan);
      const order = widgetOrder(paid, normalizeSettings(w.settings));
      need(
        order,
        account.plan.refreshHours,
        paid ? PAID_REVIEWS : FREE_REVIEWS,
      );
      if (paid) need(HIGHEST_RATED, FILL_HOURS, PAID_REVIEWS);
      places.set(w.placeId, sorts);
    }
    return places;
  }

  /** Hours between refreshes for every place: its fastest order's. */
  async placeHours(): Promise<Map<string, number>> {
    return this.hoursOf(await this.placePlans());
  }

  private hoursOf(plans: Map<string, Map<string, SortPlan>>) {
    return new Map(
      [...plans].map(([placeId, sorts]) => [
        placeId,
        Math.min(...[...sorts.values()].map((s) => s.hours)),
      ]),
    );
  }

  async sync() {
    // More than one backend process: only one of them syncs each round.
    if (!(await this.redis.setIfAbsent('engine-sync:lock', 25 * 60))) return;
    try {
      const plans = await this.placePlans();
      const hours = this.hoursOf(plans);
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
          // An engine without per-order plans ignores `sorts` and refreshes
          // every order at refreshHours.
          widgets: [...plans].map(([placeId, sorts]) => ({
            placeId,
            refreshHours: hours.get(placeId),
            sorts: [...sorts].map(([sort, s]) => ({
              sort,
              refreshHours: s.hours,
              reviews: s.count,
            })),
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
