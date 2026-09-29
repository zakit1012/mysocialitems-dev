import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { currentPeriod } from '../billing/plans';

type Counts = { views: number; loads: number; clicks: number; missed: number };

const DAY_MS = 86_400_000;

/** "2026-09-26" in UTC - the key of a widget's row for that day. */
export function statDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

const zero = (): Counts => ({ views: 0, loads: 0, clicks: 0, missed: 0 });

function add(into: Counts, row: Counts) {
  into.views += row.views;
  into.loads += row.loads;
  into.clicks += row.clicks;
  into.missed += row.missed;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** Adds to today's row for a widget. Never throws - a counter is not worth failing a page render over. */
  async record(widgetId: string, counts: Partial<Counts>) {
    const day = statDay();
    const increments = Object.fromEntries(
      Object.entries(counts)
        .filter(([, n]) => n)
        .map(([key, n]) => [key, { increment: n }]),
    );
    if (!Object.keys(increments).length) return;
    await this.prisma.widgetStat
      .upsert({
        where: { widgetId_day: { widgetId, day } },
        update: increments,
        create: { widgetId, day, ...counts },
      })
      .catch(() => undefined);
  }

  /**
   * The owner's analytics page: this month against the plan, then the last
   * `days` days - per day, per widget, per website - with the `days` before
   * them for comparison, and the opens of each business's review link and
   * QR code.
   */
  async overview(userId: string, days: number) {
    const today = new Date();
    const since = statDay(new Date(today.getTime() - (days - 1) * DAY_MS));
    // The same number of days just before, for "up 12%".
    const before = statDay(new Date(today.getTime() - (2 * days - 1) * DAY_MS));
    const period = currentPeriod(today);

    const [plan, usage, widgets, rows, sources, businesses, opens, allOpens] =
      await Promise.all([
        this.billing.planFor(userId),
        this.prisma.usage.findUnique({
          where: { userId_period: { userId, period } },
        }),
        this.prisma.widget.findMany({
          where: { userId },
          select: { id: true, placeName: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.widgetStat.findMany({
          where: { widget: { userId }, day: { gte: before } },
        }),
        this.prisma.source.findMany({
          where: { userId },
          select: { domain: true, hits: true, lastSeen: true },
          orderBy: { hits: 'desc' },
        }),
        this.prisma.business.findMany({
          where: { userId },
          select: { id: true, placeName: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.reviewLinkOpen.findMany({
          where: { business: { userId }, day: { gte: before } },
        }),
        this.prisma.reviewLinkOpen.groupBy({
          by: ['businessId'],
          where: { business: { userId } },
          _sum: { opens: true },
        }),
      ]);

    // Every day in the range, zeros included, so the chart has no holes.
    const daily = new Map<string, Counts & { opens: number }>();
    for (let i = days - 1; i >= 0; i--) {
      daily.set(statDay(new Date(today.getTime() - i * DAY_MS)), {
        ...zero(),
        opens: 0,
      });
    }
    const perWidget = new Map<string, Counts>(
      widgets.map((w) => [w.id, zero()]),
    );
    const totals = zero();
    const previous = { ...zero(), opens: 0 };
    for (const row of rows) {
      if (row.day < since) {
        add(previous, row);
        continue;
      }
      const day = daily.get(row.day);
      if (day) add(day, row);
      const widget = perWidget.get(row.widgetId);
      if (widget) add(widget, row);
      add(totals, row);
    }

    const perBusiness = new Map(businesses.map((b) => [b.id, 0]));
    let opened = 0;
    for (const row of opens) {
      if (row.day < since) {
        previous.opens += row.opens;
        continue;
      }
      const day = daily.get(row.day);
      if (day) day.opens += row.opens;
      perBusiness.set(
        row.businessId,
        (perBusiness.get(row.businessId) ?? 0) + row.opens,
      );
      opened += row.opens;
    }
    const ever = new Map(
      allOpens.map((r) => [r.businessId, r._sum.opens ?? 0]),
    );

    return {
      days,
      plan: { name: plan.name, views: plan.views },
      month: { period, views: usage?.views ?? 0 },
      totals: { ...totals, opens: opened },
      previous,
      daily: [...daily].map(([day, counts]) => ({ day, ...counts })),
      widgets: widgets.map((w) => ({
        id: w.id,
        name: w.placeName,
        ...(perWidget.get(w.id) ?? zero()),
      })),
      domains: sources,
      reviewLinks: businesses.map((b) => ({
        id: b.id,
        name: b.placeName,
        opens: perBusiness.get(b.id) ?? 0,
        total: ever.get(b.id) ?? 0,
      })),
    };
  }
}
