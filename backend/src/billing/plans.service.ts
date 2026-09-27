import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BillingPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PLANS,
  FREE_KEY,
  Plan,
  PlanInput,
  ProductCurrency,
  UNLIMITED,
  productField,
  defaultRefreshHours,
  defaultYearlyPrice,
  MIN_INR,
} from './plans';

@Injectable()
export class PlansService {
  private cache: Plan[] | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  private toPlan(row: BillingPlan): Plan {
    return {
      key: row.key,
      name: row.name,
      priceUsd: row.priceUsd,
      sources: row.sources,
      widgets: row.widgets,
      reviews: row.reviews,
      views: row.views ?? UNLIMITED,
      refreshHours: row.refreshHours ?? defaultRefreshHours(row.key),
      active: row.active,
      sortOrder: row.sortOrder,
      priceYearlyUsd: row.priceYearlyUsd ?? defaultYearlyPrice(row.priceUsd),
      priceInr: row.priceInr ?? null,
      priceYearlyInr:
        row.priceYearlyInr ??
        (row.priceInr != null ? defaultYearlyPrice(row.priceInr) : null),
      dodoMonthlyIdTest: row.dodoMonthlyIdTest,
      dodoMonthlyIdLive: row.dodoMonthlyIdLive,
      dodoYearlyIdTest: row.dodoYearlyIdTest,
      dodoYearlyIdLive: row.dodoYearlyIdLive,
      dodoMonthlyInrIdTest: row.dodoMonthlyInrIdTest,
      dodoMonthlyInrIdLive: row.dodoMonthlyInrIdLive,
      dodoYearlyInrIdTest: row.dodoYearlyInrIdTest,
      dodoYearlyInrIdLive: row.dodoYearlyInrIdLive,
    };
  }

  /** All plans, seeding the defaults the first time the table is empty. */
  async all(): Promise<Plan[]> {
    if (this.cache && Date.now() - this.cachedAt < 30_000) return this.cache;
    let rows = await this.prisma.billingPlan.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    if (rows.length === 0) {
      await this.prisma.billingPlan.createMany({
        data: DEFAULT_PLANS.map((p) => ({
          ...p,
          views: p.views >= UNLIMITED ? null : p.views,
        })),
        skipDuplicates: true,
      });
      rows = await this.prisma.billingPlan.findMany({
        orderBy: { sortOrder: 'asc' },
      });
    }
    this.cache = rows.map((r) => this.toPlan(r));
    this.cachedAt = Date.now();
    return this.cache;
  }

  async get(key: string): Promise<Plan | undefined> {
    return (await this.all()).find((p) => p.key === key);
  }

  async free(): Promise<Plan> {
    const plan = await this.get(FREE_KEY);
    if (!plan) throw new NotFoundException('The FREE plan is missing.');
    return plan;
  }

  /**
   * The plan a Dodo product belongs to, and whether it is the yearly one.
   * Products of both modes count, so test and live data both resolve.
   */
  async byDodoProduct(
    productId: string | undefined,
  ): Promise<
    { plan: Plan; yearly: boolean; currency: ProductCurrency } | undefined
  > {
    if (!productId) return undefined;
    for (const plan of await this.all()) {
      for (const mode of ['test', 'live'] as const) {
        for (const interval of ['month', 'year'] as const) {
          for (const currency of ['USD', 'INR'] as const) {
            if (plan[productField(mode, interval, currency)] === productId) {
              return { plan, yearly: interval === 'year', currency };
            }
          }
        }
      }
    }
    return undefined;
  }

  invalidate() {
    this.cache = null;
  }

  async upsert(input: PlanInput) {
    const key = input.key
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    if (!key) throw new BadRequestException('Plan key is required.');
    if (key === FREE_KEY && input.priceUsd && input.priceUsd > 0) {
      throw new BadRequestException('The FREE plan must stay at $0.');
    }
    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException('Plan name cannot be empty.');
    }
    if (
      input.priceUsd !== undefined &&
      !(Number.isFinite(input.priceUsd) && input.priceUsd >= 0)
    ) {
      throw new BadRequestException('Price must be $0 or more.');
    }
    if (
      input.priceYearlyUsd !== undefined &&
      input.priceYearlyUsd !== null &&
      !(Number.isFinite(input.priceYearlyUsd) && input.priceYearlyUsd >= 0)
    ) {
      throw new BadRequestException('Yearly price must be $0 or more.');
    }
    const whole = (v: number | undefined, label: string, max: number) => {
      if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= max)) {
        throw new BadRequestException(
          `${label} must be a whole number from 1 to ${max.toLocaleString()}.`,
        );
      }
    };
    whole(input.sources, 'Sources', 10_000);
    whole(input.widgets, 'Widgets', 10_000);
    // The review engine serves at most 50 reviews per call.
    whole(input.reviews, 'Reviews per widget', 50);
    for (const [label, value] of [
      ['Rupee price', input.priceInr],
      ['Yearly rupee price', input.priceYearlyInr],
    ] as const) {
      if (
        value !== undefined &&
        value !== null &&
        !(Number.isFinite(value) && value >= MIN_INR)
      ) {
        throw new BadRequestException(
          `${label} must be at least ₹${MIN_INR}, or blank.`,
        );
      }
    }
    // The review engine refreshes at most every 2 hours and keeps a cache 7 days.
    const hours = input.refreshHours;
    if (
      hours !== undefined &&
      !(Number.isInteger(hours) && hours >= 2 && hours <= 168)
    ) {
      throw new BadRequestException(
        'Refresh hours must be a whole number from 2 to 168.',
      );
    }
    if (
      input.views !== undefined &&
      input.views !== null &&
      input.views < UNLIMITED
    ) {
      whole(input.views, 'Monthly views', 100_000_000);
    }
    if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
      throw new BadRequestException('Sort order must be a whole number.');
    }
    const views =
      input.views === undefined
        ? undefined
        : input.views === null || input.views >= UNLIMITED
          ? null
          : input.views;

    const data = {
      name: input.name?.trim(),
      priceUsd:
        input.priceUsd === undefined
          ? undefined
          : Math.round(input.priceUsd * 100) / 100,
      sources: input.sources,
      widgets: input.widgets,
      reviews: input.reviews,
      views,
      refreshHours: input.refreshHours,
      active: input.active,
      sortOrder: input.sortOrder,
      // null clears it back to "10x monthly"
      priceYearlyUsd:
        input.priceYearlyUsd === undefined || input.priceYearlyUsd === null
          ? input.priceYearlyUsd
          : Math.round(input.priceYearlyUsd * 100) / 100,
      // null clears the rupee price
      priceInr:
        input.priceInr === undefined || input.priceInr === null
          ? input.priceInr
          : Math.round(input.priceInr * 100) / 100,
      priceYearlyInr:
        input.priceYearlyInr === undefined || input.priceYearlyInr === null
          ? input.priceYearlyInr
          : Math.round(input.priceYearlyInr * 100) / 100,
      dodoMonthlyIdTest: input.dodoMonthlyIdTest,
      dodoMonthlyIdLive: input.dodoMonthlyIdLive,
      dodoYearlyIdTest: input.dodoYearlyIdTest,
      dodoYearlyIdLive: input.dodoYearlyIdLive,
      dodoMonthlyInrIdTest: input.dodoMonthlyInrIdTest,
      dodoMonthlyInrIdLive: input.dodoMonthlyInrIdLive,
      dodoYearlyInrIdTest: input.dodoYearlyInrIdTest,
      dodoYearlyInrIdLive: input.dodoYearlyInrIdLive,
    };
    // undefined means "leave as is"
    for (const k of Object.keys(data) as (keyof typeof data)[]) {
      if (data[k] === undefined) delete data[k];
    }

    const row = await this.prisma.billingPlan.upsert({
      where: { key },
      update: data,
      create: {
        key,
        name: input.name ?? key,
        priceUsd: input.priceUsd ?? 0,
        sources: input.sources ?? 1,
        widgets: input.widgets ?? 1,
        reviews: input.reviews ?? 3,
        views: views ?? null,
        refreshHours: input.refreshHours ?? null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 50,
      },
    });
    this.invalidate();
    return this.toPlan(row);
  }
}
