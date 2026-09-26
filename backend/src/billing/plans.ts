/**
 * Plan shapes and the defaults the BillingPlan table is seeded with.
 * After the first boot the database is the source of truth - edit plans from
 * the super admin panel, not here.
 */
export type Plan = {
  key: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  /** Widget loads per calendar month. UNLIMITED means no cap. */
  views: number;
  /** Hours between automatic review refreshes. */
  refreshHours: number;
  active: boolean;
  sortOrder: number;
  /** Price for a year paid up front. */
  priceYearlyUsd: number;
  /** What customers in India pay, in rupees; null when not set. */
  priceInr: number | null;
  priceYearlyInr: number | null;
  /** Dodo Payments product per mode and billing period. */
  dodoMonthlyIdTest: string | null;
  dodoMonthlyIdLive: string | null;
  dodoYearlyIdTest: string | null;
  dodoYearlyIdLive: string | null;
};

export type BillingInterval = 'month' | 'year';

/** What an admin save sends: any field, and a yearly price of null resets it. */
export type PlanInput = Partial<Omit<Plan, 'priceYearlyUsd'>> & {
  key: string;
  priceYearlyUsd?: number | null;
};

/** Dodo takes at least ₹5 for anything billed in rupees. */
export const MIN_INR = 5;

/** Everything except Free: no "Powered by" link, and the review tools. */
export function isPaidPlan(plan: Plan): boolean {
  return plan.key !== FREE_KEY;
}

/** A yearly price nobody set: ten months, so two months come free. */
export const defaultYearlyPrice = (monthly: number) =>
  Math.round(monthly * 10 * 100) / 100;

/** Stands in for "no limit" in memory; stored as NULL in the database. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const FREE_KEY = 'FREE';

export const DEFAULT_PLANS: Omit<
  Plan,
  | 'priceYearlyUsd'
  | 'priceInr'
  | 'priceYearlyInr'
  | 'dodoMonthlyIdTest'
  | 'dodoMonthlyIdLive'
  | 'dodoYearlyIdTest'
  | 'dodoYearlyIdLive'
>[] = [
  {
    key: 'FREE',
    name: 'Free',
    priceUsd: 0,
    sources: 1,
    widgets: 1,
    reviews: 3,
    views: 200,
    refreshHours: 48,
    active: true,
    sortOrder: 0,
  },
  {
    key: 'PRO',
    name: 'Pro',
    priceUsd: 5,
    sources: 3,
    widgets: 3,
    reviews: 10,
    views: UNLIMITED,
    refreshHours: 24,
    active: true,
    sortOrder: 1,
  },
  {
    key: 'BUSINESS',
    name: 'Business',
    priceUsd: 10,
    sources: 8,
    widgets: 8,
    reviews: 50,
    views: UNLIMITED,
    refreshHours: 12,
    active: true,
    sortOrder: 2,
  },
];

/** Admins run the platform and are never throttled by a plan. */
export const ADMIN_LIMITS: Plan = {
  key: 'ADMIN',
  name: 'Admin',
  priceUsd: 0,
  sources: 1_000_000,
  widgets: 1_000_000,
  reviews: 50,
  views: UNLIMITED,
  refreshHours: 12,
  active: true,
  sortOrder: 99,
  priceYearlyUsd: 0,
  priceInr: null,
  priceYearlyInr: null,
  dodoMonthlyIdTest: null,
  dodoMonthlyIdLive: null,
  dodoYearlyIdTest: null,
  dodoYearlyIdLive: null,
};

/** Plans saved before refresh hours existed, or added without one. */
export function defaultRefreshHours(key: string): number {
  return DEFAULT_PLANS.find((p) => p.key === key)?.refreshHours ?? 24;
}

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
