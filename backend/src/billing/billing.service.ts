import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Payment, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import {
  DodoClient,
  DodoMode,
  DodoPayment,
  DodoRefund,
  DodoSubscription,
} from './dodo.client';
import { PlansService } from './plans.service';
import {
  ADMIN_LIMITS,
  BillingInterval,
  currentPeriod,
  FREE_KEY,
  Plan,
  PlanInput,
  UNLIMITED,
} from './plans';
import { PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';
import { appUrl } from '../common/urls';

type Resource = 'widgets' | 'sources';

/** Invoice settings the super admin fills in (who the seller is). */
const INVOICE_KEYS = [
  'SELLER_NAME',
  'SELLER_ADDRESS',
  'SELLER_EMAIL',
  'SELLER_TAX_ID',
  'NOTE',
] as const;

/** Dodo keys the admin panel edits. Every one is a secret. */
const DODO_KEYS = [
  'TEST_API_KEY',
  'TEST_WEBHOOK_SECRET',
  'LIVE_API_KEY',
  'LIVE_WEBHOOK_SECRET',
] as const;

/** Events the Dodo webhook must send. */
const WEBHOOK_EVENTS = [
  'subscription.active',
  'subscription.updated',
  'subscription.renewed',
  'subscription.plan_changed',
  'subscription.past_due',
  'subscription.on_hold',
  'subscription.paused',
  'subscription.unpaused',
  'subscription.cancelled',
  'subscription.expired',
  'subscription.failed',
  'payment.succeeded',
  'refund.succeeded',
  'dispute.lost',
];

export const invoiceNumber = (n: number) =>
  `WPOP-${String(n).padStart(5, '0')}`;
const fmtMoney = (cents: number, currency: string) =>
  `${currency === 'USD' ? '$' : currency === 'INR' ? '₹' : `${currency} `}${(cents / 100).toFixed(2)}`;

const DAY_MS = 86_400_000;
// Dodo's grace period (set to 5 days in its dashboard) handles a failed
// renewal; Indian mandates settle up to 48h late. A subscription still
// unpaid a day after that is checked with Dodo in case a webhook was lost.
const CHECK_AFTER_MS = 6 * DAY_MS;
// Yearly customers are told a week before the next charge.
const REMIND_BEFORE_MS = 7 * DAY_MS;
// A charge no webhook has told us about this long after it was made is
// recorded from Dodo's own list; a newer one is left to its webhook, which
// also sends the receipt.
const MISSED_AFTER_MS = 10 * 60 * 1000;

/** "12 Oct 2026" - the same in every email, whatever the server locale. */
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const fmtUsd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const fmtViews = (views: number) =>
  views >= UNLIMITED ? 'unlimited' : views.toLocaleString();

/** How the customer pays: UPI is for rupee subscriptions only. */
const payMethod = (sub: { currency: string | null }) =>
  sub.currency === 'INR' ? 'card or UPI' : 'card';

/** A string field from an untrusted webhook payload, or ''. */
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** The currency a checkout was opened in (INR in India, else USD), from its metadata. */
const checkoutCurrency = (metadata?: Record<string, string>) =>
  metadata?.currency === 'INR' || metadata?.currency === 'USD'
    ? metadata.currency
    : null;

/** What a plan costs over a year on a period, to tell an upgrade from a downgrade. */
const yearlyValue = (plan: Plan, interval: string) =>
  interval === 'year' ? plan.priceYearlyUsd : plan.priceUsd * 12;

/**
 * Our state for a Dodo subscription. A failed renewal first opens Dodo's
 * grace period (past_due: access continues), then puts the subscription
 * on hold (PAST_DUE here: Free limits until it is paid). null = a
 * subscription that never started (pending, failed): leave the account alone.
 */
function stateFor(
  remote: DodoSubscription,
): { status: string; cancelAtPeriodEnd: boolean } | null {
  const end = remote.next_billing_date
    ? new Date(remote.next_billing_date)
    : null;
  switch (remote.status) {
    case 'active':
    case 'past_due':
      return remote.cancel_at_next_billing_date
        ? { status: 'CANCELLED', cancelAtPeriodEnd: true }
        : { status: 'ACTIVE', cancelAtPeriodEnd: false };
    case 'on_hold':
      return { status: 'PAST_DUE', cancelAtPeriodEnd: false };
    case 'paused':
      return { status: 'SUSPENDED', cancelAtPeriodEnd: false };
    case 'cancelled':
      // Paid time left: it runs to the end of what was paid for.
      return end && end > new Date()
        ? { status: 'CANCELLED', cancelAtPeriodEnd: true }
        : { status: 'EXPIRED', cancelAtPeriodEnd: false };
    case 'expired':
      return { status: 'EXPIRED', cancelAtPeriodEnd: false };
    default:
      return null;
  }
}

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly dodo: DodoClient,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private appUrl(): string {
    return appUrl(this.config);
  }

  // ------------------------------------------------------------------ plans

  /** Every account has a subscription row; missing ones are created on Free. */
  async subscriptionFor(userId: string): Promise<Subscription> {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    try {
      return await this.prisma.subscription.create({
        data: { userId, plan: FREE_KEY, status: 'ACTIVE' },
      });
    } catch (err) {
      // Two requests for a brand-new account can both try to create the row;
      // Postgres lets one win, and the other just reads what it wrote.
      const row = await this.prisma.subscription.findUnique({
        where: { userId },
      });
      if (row) return row;
      throw err;
    }
  }

  /**
   * The plan whose limits apply right now. A cancelled subscription keeps its
   * paid plan until the end of the period it was paid for; so does a plan
   * support gave until a date. A Dodo renewal gets its grace from Dodo
   * itself, since the payment lands after the date.
   */
  async planFor(userId: string): Promise<Plan> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === 'ADMIN') return ADMIN_LIMITS;

    const sub = await this.subscriptionFor(userId);
    const paidThrough =
      sub.currentPeriodEnd && sub.currentPeriodEnd > new Date();
    const live =
      (sub.status === 'ACTIVE' &&
        (Boolean(sub.dodoSubscriptionId) ||
          !sub.currentPeriodEnd ||
          paidThrough)) ||
      (sub.status === 'CANCELLED' && paidThrough);
    const plan = live ? await this.plans.get(sub.plan) : undefined;
    return plan ?? (await this.plans.free());
  }

  /**
   * Which of an account's widgets and domains its plan covers: the oldest
   * ones, up to the plan's limits. After a downgrade (a cancelled plan that
   * ran out, an overdue payment) the rest pause until the owner upgrades or
   * removes some - Free limits mean Free limits.
   */
  async coverage(userId: string, known?: Plan) {
    const plan = known ?? (await this.planFor(userId));
    // Admin and "unlimited" plans: no need to list anything.
    const cap = (n: number) => (n >= 10_000 ? undefined : n);
    const order = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
    const [widgets, sources] = await Promise.all([
      this.prisma.widget.findMany({
        where: { userId },
        orderBy: order,
        take: cap(plan.widgets),
        select: { id: true },
      }),
      this.prisma.source.findMany({
        where: { userId },
        orderBy: order,
        take: cap(plan.sources),
        select: { id: true },
      }),
    ]);
    return {
      plan,
      widgets: new Set(widgets.map((w) => w.id)),
      sources: new Set(sources.map((s) => s.id)),
    };
  }

  /** Throws a clear, user-facing error when a plan limit would be exceeded. */
  async assertCanAdd(userId: string, resource: Resource) {
    const plan = await this.planFor(userId);
    const used =
      resource === 'widgets'
        ? await this.prisma.widget.count({ where: { userId } })
        : await this.prisma.source.count({ where: { userId } });
    const limit = resource === 'widgets' ? plan.widgets : plan.sources;
    if (used >= limit) {
      const noun = resource === 'widgets' ? 'widget' : 'domain';
      throw new ForbiddenException(
        `Your ${plan.name} plan allows ${limit} ${noun}${limit === 1 ? '' : 's'}. ` +
          `Upgrade under Billing to add more.`,
      );
    }
  }

  // ------------------------------------------------------------------ usage

  /**
   * Counts one view against the owner's monthly allowance and returns how many
   * reviews to show, or allowed=false once the month is used up. With count
   * false (a repeat load by the same visitor) nothing is added; the allowance
   * is only checked. Pass the owner's plan if the caller already has it.
   */
  async recordView(
    userId: string,
    count = true,
    known?: Plan,
  ): Promise<{ allowed: boolean; reviews: number; plan: Plan }> {
    const plan = known ?? (await this.planFor(userId));
    const period = currentPeriod();
    const where = { userId_period: { userId, period } };

    if (!count) {
      const usage = await this.prisma.usage.findUnique({ where });
      return {
        allowed: (usage?.views ?? 0) <= plan.views,
        reviews: plan.reviews,
        plan,
      };
    }

    const usage = await this.prisma.usage.upsert({
      where,
      update: { views: { increment: 1 } },
      create: { userId, period, views: 1 },
    });

    const allowed = usage.views <= plan.views;

    // One warning at 80% and one at the limit - not one per view after that.
    if (plan.views < UNLIMITED) {
      // Sent in the background: a widget page view never waits on email.
      if (!usage.warned80 && usage.views >= plan.views * 0.8) {
        void this.flagAndMail(usage.id, 'warned80', userId, plan, 80).catch(
          () => undefined,
        );
      }
      if (!usage.warned100 && usage.views >= plan.views) {
        void this.flagAndMail(usage.id, 'warned100', userId, plan, 100).catch(
          () => undefined,
        );
      }
    }

    return { allowed, reviews: plan.reviews, plan };
  }

  private async flagAndMail(
    usageId: string,
    flag: 'warned80' | 'warned100',
    userId: string,
    plan: Plan,
    percent: number,
  ) {
    // updateMany with the flag in the where clause makes this idempotent under
    // concurrent views: only the request that flips the flag sends the email.
    const flipped = await this.prisma.usage.updateMany({
      where: { id: usageId, [flag]: false },
      data: { [flag]: true },
    });
    if (flipped.count === 0) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    await this.mail.send(
      user.email,
      percent >= 100
        ? 'Your widgets have stopped showing this month'
        : `You have used ${percent}% of your widget views`,
      percent >= 100
        ? [
            `Hi ${user.name},`,
            `Your widgets have reached the ${fmtViews(plan.views)} views included in the ${plan.name} plan this month, so they are hidden on your site until the 1st.`,
            'Upgrade now and they come back immediately.',
          ]
        : [
            `Hi ${user.name},`,
            `Your widgets have been viewed ${Math.round((plan.views * percent) / 100).toLocaleString()} times this month - ${percent}% of the ${fmtViews(plan.views)} included in the ${plan.name} plan.`,
            'When the limit is reached, widgets stop showing until the next month.',
          ],
      { label: 'See plans', url: `${this.appUrl()}/dashboard/billing` },
    );
  }

  // --------------------------------------------------------------- overview

  /** The Dodo product for a plan, in a mode and billing period. */
  private static productFor(
    plan: Plan,
    mode: DodoMode,
    interval: BillingInterval,
  ): string | undefined {
    const id =
      interval === 'year'
        ? mode === 'live'
          ? plan.dodoYearlyIdLive
          : plan.dodoYearlyIdTest
        : mode === 'live'
          ? plan.dodoMonthlyIdLive
          : plan.dodoMonthlyIdTest;
    return id ?? undefined;
  }

  /** A subscription Dodo no longer bills: nothing there to cancel. */
  private static ended(sub: Subscription) {
    return sub.status === 'CANCELLED' || sub.status === 'EXPIRED';
  }

  /**
   * Where a new checkout for this account goes: Dodo's test mode (sandbox)
   * for a developer account, else the site-wide switch in Admin -> Dodo.
   */
  private async checkoutMode(userId: string): Promise<DodoMode> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { testPayments: true },
    });
    return user?.testPayments ? 'test' : this.dodo.mode();
  }

  /** The mode a subscription lives in; rows from before it was kept use the site-wide one. */
  private async modeOf(sub: Subscription): Promise<DodoMode> {
    return sub.dodoMode === 'test' || sub.dodoMode === 'live'
      ? sub.dodoMode
      : this.dodo.mode();
  }

  /** A subscription that is not over is handled in its own mode; otherwise the account's. */
  private async accountMode(sub: Subscription): Promise<DodoMode> {
    return sub.dodoSubscriptionId && sub.status !== 'EXPIRED'
      ? this.modeOf(sub)
      : this.checkoutMode(sub.userId);
  }

  async overview(userId: string) {
    const [sub, plan, widgets, sources, usage, all] = await Promise.all([
      this.subscriptionFor(userId),
      this.planFor(userId),
      this.prisma.widget.count({ where: { userId } }),
      this.prisma.source.count({ where: { userId } }),
      this.prisma.usage.findUnique({
        where: { userId_period: { userId, period: currentPeriod() } },
      }),
      this.plans.all(),
    ]);
    // A developer account sees test mode (and its test products) even on a live site.
    const mode = await this.accountMode(sub);
    const enabled = await this.dodo.configured(mode);
    const currency = await this.billedCurrency(sub);

    const plans = all
      .filter((p) => p.active)
      .map((p) => ({
        id: p.key,
        name: p.name,
        priceUsd: p.priceUsd,
        sources: p.sources,
        widgets: p.widgets,
        reviews: p.reviews,
        views: p.views,
        refreshHours: p.refreshHours,
        priceYearlyUsd: p.priceYearlyUsd,
        available:
          p.key === FREE_KEY ||
          (enabled && Boolean(BillingService.productFor(p, mode, 'month'))),
        availableYearly:
          p.key !== FREE_KEY &&
          enabled &&
          Boolean(BillingService.productFor(p, mode, 'year')),
      }));

    return {
      plan: { ...plan, id: plan.key },
      subscription: {
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        pendingPlan: sub.pendingPlan,
        interval: sub.interval,
        currency,
        /** Billed through Dodo: can be cancelled, resumed or changed here. */
        hasSubscription: Boolean(sub.dodoSubscriptionId),
        /** Card or UPI can be updated in Dodo's customer portal. */
        canManagePayment: Boolean(sub.dodoCustomerId),
      },
      details: {
        name: sub.billingName ?? '',
        address: sub.billingAddress ?? '',
        taxId: sub.billingTaxId ?? '',
      },
      usage: {
        period: currentPeriod(),
        views: usage?.views ?? 0,
        widgets,
        sources,
      },
      plans,
      billingEnabled: enabled,
      testMode: mode === 'test',
    };
  }

  // --------------------------------------------------------------- checkout

  /**
   * Starts paying for a plan. A new subscriber gets a Dodo checkout for the
   * plan's dollar price; customers in India see it in rupees, converted by
   * Dodo, and can pay with UPI AutoPay or an Indian card. Someone already paying switches plan on their
   * existing subscription instead (an upgrade is charged the difference now,
   * a downgrade applies at the next billing date), and taking back a
   * cancelled plan simply undoes the cancellation.
   */
  async startCheckout(
    userId: string,
    planKey: string,
    intervalRaw?: string,
    regionRaw?: string,
  ): Promise<
    | { checkoutUrl: string }
    | { done: 'resumed' | 'upgraded' }
    | { done: 'scheduled'; effectiveAt: Date | null }
  > {
    const plan = await this.plans.get(String(planKey ?? ''));
    if (!plan || plan.key === FREE_KEY || !plan.active) {
      throw new BadRequestException('Pick a paid plan.');
    }
    const interval: BillingInterval = intervalRaw === 'year' ? 'year' : 'month';

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const sub = await this.subscriptionFor(userId);
    const paidAhead = Boolean(
      sub.currentPeriodEnd && sub.currentPeriodEnd > new Date(),
    );
    const running =
      Boolean(sub.dodoSubscriptionId) &&
      (sub.status === 'ACTIVE' || (sub.status === 'CANCELLED' && paidAhead));

    // A running subscription changes in the mode it lives in; a new one
    // starts in the account's (test for a developer account).
    const mode = running
      ? await this.modeOf(sub)
      : await this.checkoutMode(userId);
    const productId = BillingService.productFor(plan, mode, interval);
    if (!productId || !(await this.dodo.configured(mode))) {
      throw new BadRequestException(
        `${plan.name}${interval === 'year' ? ' yearly' : ''} is not available yet.`,
      );
    }

    if (running && sub.dodoSubscriptionId) {
      const id = sub.dodoSubscriptionId;
      const samePlan = sub.plan === plan.key && sub.interval === interval;
      if (samePlan && sub.status === 'CANCELLED') {
        await this.resume(userId);
        return { done: 'resumed' };
      }
      if (samePlan) {
        throw new BadRequestException(
          `You are already on ${plan.name}${interval === 'year' ? ' yearly' : ''}.`,
        );
      }
      const current = (await this.plans.get(sub.plan)) ?? plan;
      if (sub.status === 'CANCELLED') {
        // Choosing another plan takes back the cancellation too.
        await this.dodo.updateSubscription(
          id,
          { cancel_at_next_billing_date: false },
          mode,
        );
      }
      const upgrade =
        yearlyValue(plan, interval) > yearlyValue(current, sub.interval);
      await this.dodo.changePlan(id, productId, upgrade, mode);
      await this.sync(userId, await this.dodo.getSubscription(id, mode), {
        mode,
      });
      return upgrade
        ? { done: 'upgraded' }
        : { done: 'scheduled', effectiveAt: sub.currentPeriodEnd };
    }

    const india = regionRaw === 'IN';
    const session = await this.dodo.createCheckout({
      mode,
      productId,
      email: user.email,
      name: user.name,
      india,
      returnUrl: `${this.appUrl()}/dashboard/billing?checkout=return`,
      cancelUrl: `${this.appUrl()}/dashboard/billing?checkout=cancel`,
      metadata: {
        user_id: userId,
        plan: plan.key,
        interval,
        mode,
        currency: india ? 'INR' : 'USD',
      },
    });
    await this.prisma.subscription.update({
      where: { userId },
      data: { pendingPlan: plan.key },
    });
    return { checkoutUrl: session.checkout_url };
  }

  /**
   * Called when Dodo sends the customer back. The webhook says the same a
   * moment later; confirming here means the page is right on arrival.
   */
  async confirm(userId: string, subscriptionId: string) {
    if (!subscriptionId) {
      throw new BadRequestException('Missing subscription id.');
    }
    // The checkout that brought them back ran in the account's mode.
    const mode = await this.checkoutMode(userId);
    const [remote, user] = await Promise.all([
      this.dodo.getSubscription(subscriptionId, mode),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    // The id comes from a query string; make sure it is this user's.
    const owner =
      remote.metadata?.user_id === userId ||
      (Boolean(user?.email) &&
        remote.customer?.email?.toLowerCase() === user?.email.toLowerCase());
    if (!owner) {
      throw new ForbiddenException(
        'That subscription belongs to someone else.',
      );
    }
    if (remote.status === 'pending') return { status: 'PENDING' };
    if (remote.status === 'failed') return { status: 'FAILED' };
    const after = await this.sync(userId, remote, { mode });
    return { status: after.status };
  }

  /**
   * Stops the renewal. A running plan stays until the end of the paid
   * period; an overdue or paused one ends now (nothing is paid ahead).
   */
  async cancel(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.dodoSubscriptionId || sub.plan === FREE_KEY) {
      throw new BadRequestException('There is no paid subscription to cancel.');
    }
    if (BillingService.ended(sub)) {
      throw new BadRequestException('This subscription is already cancelled.');
    }
    const id = sub.dodoSubscriptionId;
    const mode = await this.modeOf(sub);
    const remote = await this.dodo.updateSubscription(
      id,
      sub.status === 'ACTIVE'
        ? {
            cancel_at_next_billing_date: true,
            cancel_reason: 'cancelled_by_customer',
          }
        : { status: 'cancelled', cancel_reason: 'cancelled_by_customer' },
      mode,
    );
    await this.sync(
      userId,
      remote?.subscription_id
        ? remote
        : await this.dodo.getSubscription(id, mode),
      { mode },
    );
    return { ok: true };
  }

  /** Takes back a cancellation before the paid period ends. */
  async resume(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (
      !sub.dodoSubscriptionId ||
      sub.status !== 'CANCELLED' ||
      !sub.currentPeriodEnd ||
      sub.currentPeriodEnd <= new Date()
    ) {
      throw new BadRequestException('There is no cancelled plan to resume.');
    }
    const id = sub.dodoSubscriptionId;
    const mode = await this.modeOf(sub);
    const remote = await this.dodo.updateSubscription(
      id,
      { cancel_at_next_billing_date: false },
      mode,
    );
    await this.sync(
      userId,
      remote?.subscription_id
        ? remote
        : await this.dodo.getSubscription(id, mode),
      { mode },
    );
    return { ok: true };
  }

  /** A link to Dodo's portal, where the customer updates their card or UPI. */
  async portal(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.dodoCustomerId) {
      throw new BadRequestException('There is no payment method to manage.');
    }
    return {
      url: await this.dodo.portalLink(
        sub.dodoCustomerId,
        await this.modeOf(sub),
      ),
    };
  }

  /** The public pricing section: active plans and their limits, nothing internal. */
  async publicPlans() {
    const all = await this.plans.all();
    return all
      .filter((p) => p.active)
      .map((p) => ({
        id: p.key,
        name: p.name,
        priceUsd: p.priceUsd,
        sources: p.sources,
        widgets: p.widgets,
        reviews: p.reviews,
        views: p.views >= UNLIMITED ? null : p.views,
        refreshHours: p.refreshHours,
        priceYearlyUsd: p.priceYearlyUsd,
      }));
  }

  // ------------------------------------------------------ subscription sync

  /**
   * Brings the account in line with a Dodo subscription and emails the
   * customer about whatever changed. Every path goes through here - the
   * return from checkout, webhooks, the hourly check, cancel and resume - and
   * emails follow the change of state, so the same news twice (a webhook and
   * a confirm) sends one email.
   */
  private async sync(
    userId: string,
    remote: DodoSubscription,
    /** mode: the Dodo mode `remote` was read from; it is kept with the subscription. */
    opts: { quiet?: boolean; mode?: DodoMode } = {},
  ): Promise<Subscription> {
    const before = await this.subscriptionFor(userId);
    const next = stateFor(remote);
    if (!next) return before;
    const isNew = before.dodoSubscriptionId !== remote.subscription_id;
    // News about an older subscription (replaced by a newer one) must not
    // change the account; only a live new one takes over.
    if (isNew && next.status !== 'ACTIVE') return before;

    const matched = await this.plans.byDodoProduct(remote.product_id);
    const plan =
      matched?.plan ??
      (isNew
        ? before.pendingPlan
          ? await this.plans.get(before.pendingPlan)
          : undefined
        : await this.plans.get(before.plan));
    if (!plan) {
      this.log.error(
        `Subscription ${remote.subscription_id} for ${userId} is for an unknown product ${remote.product_id}`,
      );
      return before;
    }

    // A second subscription replaces the first: stop billing the old one.
    if (isNew && before.dodoSubscriptionId && !BillingService.ended(before)) {
      await this.dodo
        .updateSubscription(
          before.dodoSubscriptionId,
          { status: 'cancelled', cancel_reason: 'cancelled_by_merchant' },
          await this.modeOf(before),
        )
        .catch((err: unknown) =>
          this.log.warn(
            `Could not cancel the old subscription: ${String(err)}`,
          ),
        );
    }

    const interval: BillingInterval = matched
      ? matched.yearly
        ? 'year'
        : 'month'
      : remote.payment_frequency_interval === 'Year'
        ? 'year'
        : remote.payment_frequency_interval === 'Month'
          ? 'month'
          : (before.interval as BillingInterval);
    // What the customer is charged in. Dodo's subscription reports its
    // product's own currency (US dollars) even when an Indian customer pays
    // in rupees, so the charges decide; before the first one is recorded,
    // the currency checkout was opened in.
    const currency =
      (await this.chargedIn(remote.subscription_id)) ??
      (isNew ? checkoutCurrency(remote.metadata) : before.currency) ??
      remote.currency ??
      null;
    const after = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: plan.key,
        status: next.status,
        cancelAtPeriodEnd: next.cancelAtPeriodEnd,
        dodoSubscriptionId: remote.subscription_id,
        ...(opts.mode ? { dodoMode: opts.mode } : {}),
        dodoCustomerId: remote.customer?.customer_id ?? before.dodoCustomerId,
        currency,
        interval,
        currentPeriodEnd: remote.next_billing_date
          ? new Date(remote.next_billing_date)
          : before.currentPeriodEnd,
        pendingPlan: null,
      },
    });
    await this.announce(before, after, plan, isNew, opts.quiet);
    return after;
  }

  /**
   * The currency an account is billed in, as its latest charge was made -
   * put right as the billing page is read, so nobody waits for the hourly
   * check. A running subscription with no charge recorded (its webhook never
   * came) has its charges read from Dodo.
   */
  private async billedCurrency(sub: Subscription): Promise<string | null> {
    const id = sub.dodoSubscriptionId;
    if (!id) return sub.currency;
    let currency = await this.chargedIn(id);
    if (!currency && sub.status !== 'EXPIRED') {
      await this.syncPayments(
        sub.userId,
        id,
        await this.modeOf(sub),
        MISSED_AFTER_MS,
      ).catch((err: unknown) =>
        this.log.warn(`Payment sync failed for ${sub.userId}: ${String(err)}`),
      );
      currency = await this.chargedIn(id);
    }
    if (!currency || currency === sub.currency) return sub.currency;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { currency },
    });
    return currency;
  }

  /** The currency of a subscription's latest recorded charge, if any. */
  private async chargedIn(subscriptionId: string): Promise<string | null> {
    const last = await this.prisma.payment.findFirst({
      where: { dodoSubscriptionId: subscriptionId },
      orderBy: { paidAt: 'desc' },
      select: { currency: true },
    });
    return last?.currency ?? null;
  }

  /**
   * Safety net, run on a timer: every subscription shows the currency its
   * latest charge was made in. Puts right accounts saved before the charges
   * decided it (Indian customers paying in rupees shown dollar prices).
   */
  async settleCurrencies(): Promise<number> {
    let fixed = 0;
    let after: string | undefined;
    for (;;) {
      const subs = await this.prisma.subscription.findMany({
        where: {
          dodoSubscriptionId: { not: null },
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 200,
        select: { id: true, dodoSubscriptionId: true, currency: true },
      });
      const latest = await this.prisma.payment.findMany({
        where: {
          dodoSubscriptionId: {
            in: subs.map((s) => s.dodoSubscriptionId as string),
          },
        },
        orderBy: [{ dodoSubscriptionId: 'asc' }, { paidAt: 'desc' }],
        distinct: ['dodoSubscriptionId'],
        select: { dodoSubscriptionId: true, currency: true },
      });
      const paidIn = new Map(
        latest.map((p) => [p.dodoSubscriptionId, p.currency]),
      );
      for (const sub of subs) {
        const currency = paidIn.get(sub.dodoSubscriptionId);
        if (!currency || currency === sub.currency) continue;
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { currency },
        });
        fixed++;
      }
      if (subs.length < 200) break;
      after = subs[subs.length - 1].id;
    }
    return fixed;
  }

  /** The email for a change of subscription state, if it deserves one. */
  private async announce(
    before: Subscription,
    after: Subscription,
    plan: Plan,
    isNew: boolean,
    quiet = false,
  ) {
    const userId = after.userId;
    const period = after.interval === 'year' ? 'yearly' : 'monthly';
    const nextDate = after.currentPeriodEnd
      ? fmtDate(after.currentPeriodEnd)
      : null;

    if (isNew) {
      await this.notify(
        userId,
        `Welcome to ${plan.name}`,
        `Your ${plan.name} plan is active: ${plan.widgets} widgets, ${plan.sources} domains, ` +
          `${plan.reviews} reviews per widget, ${fmtViews(plan.views)} views a month and reviews updated every ${plan.refreshHours} hours. ` +
          `It renews ${period}` +
          (nextDate ? `; the next payment is on ${nextDate}.` : '.') +
          ' You can cancel any time from Billing.',
      );
      return;
    }

    const was = before.status;
    const now = after.status;
    if (now === 'ACTIVE') {
      if ((was === 'PAST_DUE' || was === 'SUSPENDED') && !quiet) {
        await this.notify(
          userId,
          `Your ${plan.name} plan is active again`,
          `Thanks - your payment went through and your ${plan.name} plan is back, with all its limits.` +
            (nextDate ? ` Next payment: ${nextDate}.` : ''),
        );
      } else if (was === 'CANCELLED') {
        await this.notify(
          userId,
          `Your ${plan.name} plan continues`,
          `Your ${plan.name} plan will not end after all: it keeps renewing ${period}` +
            (nextDate ? `, next on ${nextDate}` : '') +
            '. You can cancel any time from Billing.',
        );
      } else if (
        was === 'ACTIVE' &&
        (before.plan !== after.plan || before.interval !== after.interval)
      ) {
        await this.notify(
          userId,
          `Your plan is now ${plan.name}`,
          `Your subscription has moved to ${plan.name}, billed ${period}` +
            (nextDate ? `; the next payment is on ${nextDate}` : '') +
            '. The new limits apply straight away.',
        );
      }
      return;
    }
    if (now === was) return;

    if (now === 'CANCELLED') {
      await this.notify(
        userId,
        'Your subscription is cancelled',
        `Your ${plan.name} subscription is cancelled and you will not be charged again. ` +
          (nextDate
            ? `You keep ${plan.name} until ${nextDate}; after that your account moves to the Free plan. `
            : '') +
          'Changed your mind? You can resume it from Billing before then.',
      );
      await this.tellTeamCancelled(
        after,
        `${plan.name} (${period}) was cancelled.`,
        nextDate
          ? `They keep ${plan.name} until ${nextDate}, then move to Free.`
          : 'The account is on Free now.',
      );
    } else if (now === 'PAST_DUE') {
      await this.notify(
        userId,
        'Your payment is overdue',
        `We could not collect the renewal for your ${plan.name} plan, so your account is on Free limits for now. ` +
          `Update your ${payMethod(after)} from Billing ("Update payment method") and your plan comes back as soon as the payment goes through.`,
      );
    } else if (now === 'SUSPENDED') {
      await this.notify(
        userId,
        'Your subscription is paused',
        `Your ${plan.name} subscription is paused, so your widgets are on Free limits until it resumes. You can manage it from Billing.`,
      );
    } else if (now === 'EXPIRED') {
      const free = await this.plans.free();
      await this.notify(
        userId,
        `Your ${plan.name} plan has ended`,
        `Your ${plan.name} plan has ended, so your account is on the Free plan now. ` +
          `Your widgets keep working within Free limits (${fmtViews(free.views)} views a month, ${free.reviews} reviews each). ` +
          'You can subscribe again any time from Billing.',
      );
      // After a cancellation the team heard already; this is one that ended at once.
      if (was !== 'CANCELLED') {
        await this.tellTeamCancelled(
          after,
          `${plan.name} (${period}) ended` +
            (was === 'PAST_DUE' || was === 'SUSPENDED'
              ? ' while a renewal was unpaid.'
              : ' - cancelled with no paid time left.'),
          'The account is on Free now.',
        );
      }
    }
  }

  /**
   * Tells the team at SUPPORT_EMAIL that a customer's paid plan stopped. A
   * developer's test subscription says so, so it is not taken for lost money.
   */
  private async tellTeamCancelled(
    sub: Subscription,
    what: string,
    after: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: sub.userId },
    });
    if (!user) return;
    const test = sub.dodoMode === 'test';
    // Not awaited, like notify(): send() never throws.
    void this.mail.sendTeam(
      `${test ? '[Test] ' : ''}Subscription cancelled: ${user.email}`,
      [
        'Hi team,',
        `${user.name} (${user.email}): ${what} ${after}`,
        ...(test ? ['This was a test-mode subscription: no real money.'] : []),
      ],
      '/admin/subscriptions',
    );
  }

  // --------------------------------------------------------------- webhooks

  /**
   * Dodo calls this. Signed with Standard Webhooks (see DodoClient), and each
   * event is processed once: retries of the same delivery are recognised by
   * their webhook id.
   */
  async handleWebhook(
    headers: Record<string, string | undefined>,
    rawBody: Buffer | undefined,
  ) {
    if (!rawBody) throw new BadRequestException('Empty webhook.');
    const mode = await this.dodo.verifyWebhook(headers, rawBody);
    if (!mode) {
      this.log.warn('Rejected an unsigned or wrongly signed webhook');
      throw new ForbiddenException('Signature check failed.');
    }
    let event: { type?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody.toString()) as typeof event;
    } catch {
      throw new BadRequestException('Not JSON.');
    }
    const type = String(event.type ?? '');
    const data = event.data ?? {};
    const eventId = `dodo:${headers['webhook-id']}`;

    const seen = await this.prisma.billingEvent.findUnique({
      where: { id: eventId },
    });
    if (seen) return { ok: true, duplicate: true };

    const userId = await this.userForEvent(type, data);
    await this.prisma.billingEvent.create({
      data: {
        id: eventId,
        type,
        userId,
        payload: JSON.parse(rawBody.toString()) as object,
      },
    });
    if (!userId) {
      this.log.warn(`Webhook ${type} for nobody we know`);
      return { ok: true };
    }

    try {
      await this.applyEvent(type, userId, data, mode);
    } catch (err) {
      // Forget the event, so Dodo's retry is processed instead of skipped.
      await this.prisma.billingEvent
        .delete({ where: { id: eventId } })
        .catch(() => undefined);
      throw err;
    }
    return { ok: true };
  }

  /** Whose account an event is about: our metadata first, then what we stored. */
  private async userForEvent(
    type: string,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    const metadata = (data.metadata ?? {}) as Record<string, string>;
    if (metadata.user_id) {
      const user = await this.prisma.user.findUnique({
        where: { id: metadata.user_id },
        select: { id: true },
      });
      if (user) return user.id;
    }
    const subscriptionId =
      typeof data.subscription_id === 'string' ? data.subscription_id : null;
    if (subscriptionId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { dodoSubscriptionId: subscriptionId },
        select: { userId: true },
      });
      if (sub) return sub.userId;
    }
    if (type.startsWith('refund.') || type.startsWith('dispute.')) {
      const paid = await this.prisma.payment.findFirst({
        where: { dodoPaymentId: text(data.payment_id) },
        select: { userId: true },
      });
      if (paid?.userId) return paid.userId;
    }
    // Checkout locks the email to the account's, so it identifies them too.
    const email = (data.customer as { email?: string } | undefined)?.email;
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      if (user) return user.id;
    }
    return null;
  }

  private async applyEvent(
    type: string,
    userId: string,
    data: Record<string, unknown>,
    mode: DodoMode,
  ) {
    if (type === 'subscription.failed') {
      // The checkout never went through: nothing to change but the pending plan.
      await this.prisma.subscription.updateMany({
        where: { userId, dodoSubscriptionId: null },
        data: { pendingPlan: null },
      });
      return;
    }
    if (type.startsWith('subscription.')) {
      const remote = data as unknown as DodoSubscription;
      const before = await this.subscriptionFor(userId);
      await this.sync(userId, remote, { mode });
      // The grace period opened: access continues, but the customer should act.
      if (
        type === 'subscription.past_due' &&
        before.dodoSubscriptionId === remote.subscription_id
      ) {
        const plan = await this.plans.get(before.plan);
        const until = remote.past_due_ends_at
          ? fmtDate(new Date(remote.past_due_ends_at))
          : null;
        await this.notify(
          userId,
          'A payment did not go through',
          `We could not collect the renewal for your ${plan?.name ?? 'paid'} plan. We will try again` +
            (until
              ? `; if it is still unpaid by ${until}`
              : '; if it stays unpaid') +
            `, your widgets move to Free limits until it goes through. Please check or update your ${payMethod(before)} from Billing.`,
        );
      }
      return;
    }
    if (type === 'payment.succeeded') {
      await this.paymentReceived(userId, data as unknown as DodoPayment, mode);
      return;
    }
    if (type === 'refund.succeeded') {
      const refund = data as unknown as DodoRefund;
      const paid = await this.prisma.payment.findFirst({
        where: { dodoPaymentId: refund.payment_id },
      });
      if (paid)
        await this.applyRefund(paid, refund.refund_id, refund.amount ?? 0);
      return;
    }
    if (type === 'dispute.lost') {
      const paid = await this.prisma.payment.findFirst({
        where: { dodoPaymentId: text(data.payment_id) },
      });
      if (paid) {
        await this.applyRefund(paid, text(data.dispute_id) || paid.id, 0, true);
      }
    }
  }

  // --------------------------------------------------------------- payments

  /** A charge went through: record it, bring the dates up to date, send a receipt. */
  private async paymentReceived(
    userId: string,
    payment: DodoPayment,
    mode: DodoMode,
  ) {
    if (payment.status && payment.status !== 'succeeded') return;
    if (!payment.subscription_id) return;
    const remote = await this.dodo
      .getSubscription(payment.subscription_id, mode)
      .catch(() => null);
    const row = await this.recordPayment(userId, payment, remote, mode);
    // Seen before (Dodo sent the same payment again): nothing more to do.
    if (row === 'duplicate' || !row) return;

    const before = await this.subscriptionFor(userId);
    // Quiet: the receipt below says "active again" itself.
    if (remote) await this.sync(userId, remote, { quiet: true, mode });
    const after = await this.subscriptionFor(userId);
    const back =
      (before.status === 'PAST_DUE' || before.status === 'SUSPENDED') &&
      after.status === 'ACTIVE';
    // The first charge of a subscription comes with the welcome email; it
    // needs no "continues as before".
    const first =
      (await this.prisma.payment.count({
        where: { dodoSubscriptionId: payment.subscription_id },
      })) === 1;
    const parts = [
      `Thanks - we received ${fmtMoney(row.amountCents, row.currency)} for ${row.planName} (${row.interval === 'year' ? 'yearly' : 'monthly'}).`,
      back
        ? 'Your plan is active again, with all its limits.'
        : first
          ? ''
          : 'Your plan continues as before.',
      after.currentPeriodEnd && after.status === 'ACTIVE'
        ? `Next payment: ${fmtDate(after.currentPeriodEnd)}.`
        : '',
    ];
    await this.notify(
      userId,
      `Payment received - ${invoiceNumber(row.number)}`,
      parts.filter(Boolean).join(' '),
      {
        label: row.invoiceUrl ? 'Download invoice' : 'View receipt',
        url: row.invoiceUrl ?? `${this.appUrl()}/invoice/${row.id}`,
      },
    );
  }

  /**
   * One row per Dodo charge: what it was for, the period it pays, and who
   * paid. Returns 'duplicate' when this charge is already recorded, and null
   * when the event does not describe a usable payment.
   */
  private async recordPayment(
    userId: string,
    payment: DodoPayment,
    remote: DodoSubscription | null,
    mode: DodoMode,
  ): Promise<Payment | 'duplicate' | null> {
    if (!payment.payment_id || !(payment.total_amount > 0)) return null;
    // A row per payment id, guarded by a billing event: two deliveries of the
    // same payment race for this insert and only one wins.
    const lock = `payment:${payment.payment_id}`;
    const fresh = await this.prisma.billingEvent
      .create({
        data: { id: lock, type: 'PAYMENT.RECORDED', userId, payload: {} },
      })
      .then(() => true)
      .catch(() => false);
    if (!fresh) return 'duplicate';

    try {
      const [user, sub] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.subscriptionFor(userId),
      ]);
      if (!user) return null;
      const matched = await this.plans.byDodoProduct(
        remote?.product_id ?? payment.product_cart?.[0]?.product_id,
      );
      const plan = matched?.plan ?? (await this.plans.get(sub.plan));
      const stamped = payment.created_at ? new Date(payment.created_at) : null;
      const paidAt =
        stamped && !Number.isNaN(stamped.getTime()) ? stamped : new Date();
      return await this.prisma.payment.create({
        data: {
          userId,
          dodoPaymentId: payment.payment_id,
          dodoSubscriptionId: payment.subscription_id ?? null,
          mode,
          plan: plan?.key ?? sub.plan,
          planName: plan?.name ?? sub.plan,
          interval: matched
            ? matched.yearly
              ? 'year'
              : 'month'
            : sub.interval,
          amountCents: payment.total_amount,
          currency: payment.currency || 'USD',
          settlementCents: payment.settlement_amount ?? null,
          settlementCurrency: payment.settlement_currency ?? null,
          invoiceUrl: payment.invoice_url ?? null,
          periodStart: paidAt,
          periodEnd: remote?.next_billing_date
            ? new Date(remote.next_billing_date)
            : null,
          customerName: user.name,
          customerEmail: user.email,
          paidAt,
        },
      });
    } catch (err) {
      await this.prisma.billingEvent
        .delete({ where: { id: lock } })
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Charges Dodo made on a subscription that no webhook told us about. No
   * receipt goes out for these; they show in the payment list. `olderThanMs`
   * leaves newer charges to their webhook.
   */
  private async syncPayments(
    userId: string,
    subscriptionId: string,
    mode: DodoMode,
    olderThanMs = 0,
  ) {
    const [list, remote] = await Promise.all([
      this.dodo.subscriptionPayments(subscriptionId, mode),
      this.dodo.getSubscription(subscriptionId, mode).catch(() => null),
    ]);
    const before = Date.now() - olderThanMs;
    let added = 0;
    for (const p of list) {
      if (p.status !== 'succeeded') continue;
      // No date: counted as old enough.
      if (olderThanMs && p.created_at && Date.parse(p.created_at) > before) {
        continue;
      }
      const row = await this.recordPayment(userId, p, remote, mode);
      if (row && row !== 'duplicate') added++;
    }
    return added;
  }

  /**
   * Books a refund (or a lost dispute) against a payment, once per refund
   * id: a refund made from the admin panel and the webhook Dodo then sends
   * about it are the same refund. Amounts are in the payment's currency.
   */
  private async applyRefund(
    payment: Payment,
    refundId: string,
    cents: number,
    reversed = false,
  ): Promise<boolean> {
    const fresh = await this.prisma.billingEvent
      .create({
        data: {
          id: `refund:${refundId}`,
          type: reversed ? 'PAYMENT.REVERSAL' : 'PAYMENT.REFUND',
          userId: payment.userId,
          payload: { paymentId: payment.id, cents },
        },
      })
      .then(() => true)
      .catch(() => false);
    if (!fresh) return false;

    // Re-read: another refund may have been booked since the caller loaded it.
    const now =
      (await this.prisma.payment.findUnique({ where: { id: payment.id } })) ??
      payment;
    const refunded = Math.min(
      now.amountCents,
      now.refundedCents + (cents > 0 ? cents : now.amountCents),
    );
    await this.prisma.payment.update({
      where: { id: now.id },
      data: {
        refundedCents: refunded,
        status: reversed
          ? 'REVERSED'
          : refunded >= now.amountCents
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED',
      },
    });
    // A lost dispute is between the customer and their bank; no email for it.
    if (now.userId && !reversed && refunded > now.refundedCents) {
      await this.notify(
        now.userId,
        `Refund for ${invoiceNumber(now.number)}`,
        `We have refunded ${fmtMoney(refunded - now.refundedCents, now.currency)} of your ` +
          `${fmtMoney(now.amountCents, now.currency)} payment for ${now.planName}. ` +
          'It goes back to the card or account you paid with; it can take 5-10 business days to show.',
        {
          label: now.invoiceUrl ? 'Download invoice' : 'View receipt',
          url: now.invoiceUrl ?? `${this.appUrl()}/invoice/${now.id}`,
        },
      );
    }
    return true;
  }

  private async notify(
    userId: string,
    subject: string,
    line: string,
    cta?: { label: string; url: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    // Not awaited: a customer coming back from checkout, or a webhook, must
    // not wait on the mail server. send() never throws.
    void this.mail.send(
      user.email,
      subject,
      [`Hi ${user.name},`, line],
      cta ?? {
        label: 'Open billing',
        url: `${this.appUrl()}/dashboard/billing`,
      },
    );
  }

  // --------------------------------------------------- payments & invoices

  /** The customer's own payments, newest first. */
  async payments(userId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { paidAt: 'desc' },
    });
    return rows.map((p) => ({
      id: p.id,
      number: invoiceNumber(p.number),
      paidAt: p.paidAt,
      planName: p.planName,
      interval: p.interval,
      amountCents: p.amountCents,
      refundedCents: p.refundedCents,
      currency: p.currency,
      status: p.status,
      invoiceUrl: p.invoiceUrl,
      test: p.mode !== 'live',
    }));
  }

  /** Name, address and tax id printed on the customer's receipts. */
  async saveDetails(userId: string, input: Record<string, unknown>) {
    const clean = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    await this.subscriptionFor(userId);
    const saved = await this.prisma.subscription.update({
      where: { userId },
      data: {
        billingName: clean(input?.name, 120),
        billingAddress: clean(input?.address, 400),
        billingTaxId: clean(input?.taxId, 40),
      },
    });
    return {
      name: saved.billingName ?? '',
      address: saved.billingAddress ?? '',
      taxId: saved.billingTaxId ?? '',
    };
  }

  /**
   * Everything a receipt shows. Its owner may open it, and an admin who has
   * passed the authenticator-app check.
   */
  async invoice(
    viewer: { id: string; role: string; mfaUntil?: number },
    paymentId: string,
  ) {
    const p = await this.prisma.payment.findUnique({
      where: { id: String(paymentId ?? '') },
    });
    const admin =
      viewer.role === 'ADMIN' &&
      Boolean(viewer.mfaUntil && viewer.mfaUntil * 1000 > Date.now());
    if (!p || (p.userId !== viewer.id && !admin)) {
      throw new NotFoundException('Invoice not found.');
    }
    const [sub, user, seller] = await Promise.all([
      p.userId
        ? this.prisma.subscription.findUnique({ where: { userId: p.userId } })
        : null,
      p.userId
        ? this.prisma.user.findUnique({ where: { id: p.userId } })
        : null,
      this.invoiceSettings(),
    ]);
    return {
      id: p.id,
      number: invoiceNumber(p.number),
      issuedAt: p.paidAt,
      status: p.status,
      test: p.mode !== 'live',
      seller,
      customer: {
        name: sub?.billingName || user?.name || p.customerName,
        email: user?.email ?? p.customerEmail,
        address: sub?.billingAddress ?? '',
        taxId: sub?.billingTaxId ?? '',
      },
      line: {
        description: `${p.planName} plan - ${p.interval === 'year' ? 'yearly' : 'monthly'} subscription`,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      },
      amountCents: p.amountCents,
      refundedCents: p.refundedCents,
      currency: p.currency,
      reference: p.dodoPaymentId ?? p.paypalSaleId ?? p.id,
      invoiceUrl: p.invoiceUrl,
    };
  }

  private async invoiceSettings() {
    const out: Record<string, string> = {};
    for (const k of INVOICE_KEYS) {
      out[k] = (await this.settings.get(`INVOICE_${k}`)) ?? '';
    }
    return {
      name: out.SELLER_NAME || PRODUCT_NAME,
      address: out.SELLER_ADDRESS,
      email: out.SELLER_EMAIL || SUPPORT_EMAIL,
      taxId: out.SELLER_TAX_ID,
      note: out.NOTE,
    };
  }

  // ------------------------------------------------------ hourly checks

  /**
   * Safety net, run on a timer: a subscription that should have renewed a
   * while ago, or is overdue or paused, is read back from Dodo in case a
   * webhook went missing. Charges nobody told us about are recorded too.
   */
  async reconcileOverdue(): Promise<{ checked: number }> {
    // Developer accounts run in test mode on a live site: either set of keys will do.
    const [live, test] = await Promise.all([
      this.dodo.configured('live'),
      this.dodo.configured('test'),
    ]);
    if (!live && !test) return { checked: 0 };
    const cutoff = new Date(Date.now() - CHECK_AFTER_MS);
    let checked = 0;
    let after: string | undefined;
    // Page by id, so a long list of overdue accounts cannot hide newer ones.
    for (;;) {
      const due = await this.prisma.subscription.findMany({
        where: {
          dodoSubscriptionId: { not: null },
          OR: [
            { status: 'ACTIVE', currentPeriodEnd: { lt: cutoff } },
            { status: 'PAST_DUE' },
            { status: 'SUSPENDED' },
          ],
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const sub of due) {
        checked++;
        await this.refreshFromDodo(sub).catch((err: unknown) =>
          this.log.warn(
            `Overdue check failed for ${sub.userId}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
      if (due.length < 50) break;
      after = due[due.length - 1].id;
    }
    return { checked };
  }

  private async refreshFromDodo(sub: Subscription) {
    const id = sub.dodoSubscriptionId as string;
    const mode = await this.modeOf(sub);
    await this.syncPayments(sub.userId, id, mode).catch((err: unknown) =>
      this.log.warn(`Payment sync failed for ${sub.userId}: ${String(err)}`),
    );
    return this.sync(sub.userId, await this.dodo.getSubscription(id, mode), {
      mode,
    });
  }

  /**
   * Paid time that has run out: a cancelled subscription past its paid-up
   * date, or a plan support gave until a date. The account is on Free from
   * then (planFor already treats it so); this makes it final and says so.
   */
  async closeEndedPlans(): Promise<number> {
    const now = new Date();
    const ended = await this.prisma.subscription.findMany({
      where: {
        currentPeriodEnd: { lt: now },
        plan: { not: FREE_KEY },
        OR: [
          { status: 'CANCELLED' },
          { status: 'ACTIVE', dodoSubscriptionId: null },
        ],
      },
      take: 100,
    });
    for (const sub of ended) {
      const name = (await this.plans.get(sub.plan))?.name ?? sub.plan;
      const free = await this.plans.free();
      await this.prisma.subscription.update({
        where: { userId: sub.userId },
        data: { status: 'EXPIRED', cancelAtPeriodEnd: false },
      });
      await this.notify(
        sub.userId,
        `Your ${name} plan has ended`,
        `Your ${name} plan ended on ${fmtDate(sub.currentPeriodEnd as Date)}, so your account is on the Free plan now. ` +
          `Your widgets keep working within Free limits (${fmtViews(free.views)} views a month, ${free.reviews} reviews each). ` +
          'You can subscribe again any time from Billing.',
      );
    }
    return ended.length;
  }

  /**
   * A week before a yearly renewal, the customer hears what will be charged
   * and when, and how to cancel. Each reminder is recorded as a billing
   * event, so it goes out once per renewal.
   */
  async sendRenewalReminders(): Promise<number> {
    const now = Date.now();
    const soon = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        interval: 'year',
        cancelAtPeriodEnd: false,
        dodoSubscriptionId: { not: null },
        currentPeriodEnd: {
          gt: new Date(now),
          lt: new Date(now + REMIND_BEFORE_MS),
        },
      },
      take: 100,
    });
    let sent = 0;
    for (const sub of soon) {
      const when = sub.currentPeriodEnd as Date;
      const id = `renewal-reminder:${sub.userId}:${when.toISOString().slice(0, 10)}`;
      const fresh = await this.prisma.billingEvent
        .create({
          data: {
            id,
            type: 'RENEWAL.REMINDER',
            userId: sub.userId,
            payload: {},
          },
        })
        .then(() => true)
        .catch(() => false);
      if (!fresh) continue;
      const plan = await this.plans.get(sub.plan);
      // A rupee subscription's amount is set at checkout; only dollars are known here.
      const amount =
        plan && (sub.currency ?? 'USD') === 'USD'
          ? ` for ${fmtUsd(plan.priceYearlyUsd)}`
          : '';
      await this.notify(
        sub.userId,
        'Your yearly plan renews soon',
        `Your ${plan?.name ?? sub.plan} plan renews on ${fmtDate(when)}${amount}, charged to your saved payment method. ` +
          'Nothing to do if you want to keep it. To stop the renewal, cancel before that date from Billing.',
      );
      sent++;
    }
    return sent;
  }

  // ------------------------------------------------------------- signup

  /** Called when an account is created: Free plan plus a welcome email. */
  async welcome(userId: string) {
    await this.subscriptionFor(userId);
    const free = await this.plans.free();
    await this.notify(
      userId,
      `Welcome to ${PRODUCT_NAME}`,
      `Your account is on the Free plan: ${free.widgets} widget, ${free.sources} domain, ` +
        `${free.reviews} reviews shown and ${fmtViews(free.views)} widget views a month. Upgrade any time from Billing.`,
    );
  }

  // ============================================================ super admin

  async adminSubscriptions() {
    const rows = await this.prisma.subscription.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            testPayments: true,
          },
        },
      },
    });
    const usage = await this.prisma.usage.findMany({
      where: { period: currentPeriod() },
    });
    const views = new Map(usage.map((u) => [u.userId, u.views]));
    const events = await this.prisma.billingEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, type: true, userId: true, createdAt: true },
    });
    return {
      mode: await this.dodo.mode(),
      subscriptions: rows.map((r) => ({
        ...r,
        viewsThisMonth: views.get(r.userId) ?? 0,
      })),
      events,
    };
  }

  /**
   * Before an account is deleted: stop any running subscription at once, so
   * nobody is billed for an account that no longer exists.
   */
  async closeForDeletion(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) return;
    const running = sub.dodoSubscriptionId && !BillingService.ended(sub);
    await this.cancelNow(sub);
    // Dodo's own "cancelled" news arrives after the account is gone, so
    // announce() never sees it: tell the team here.
    if (running) {
      const plan = await this.plans.get(sub.plan);
      await this.tellTeamCancelled(
        sub,
        `${plan?.name ?? sub.plan} was cancelled because they deleted their account.`,
        'It was stopped at once; no further charges.',
      );
    }
  }

  /** Stops a Dodo subscription at once (support actions). */
  private async cancelNow(sub: Subscription) {
    if (!sub.dodoSubscriptionId || BillingService.ended(sub)) return;
    await this.dodo.updateSubscription(
      sub.dodoSubscriptionId,
      { status: 'cancelled', cancel_reason: 'cancelled_by_merchant' },
      await this.modeOf(sub),
    );
  }

  /**
   * Put a user on a plan by hand - a comped account, a refund, a support fix.
   * If they had a running subscription for a different plan it is cancelled
   * first, so they are not billed for a plan they no longer have.
   */
  async adminSetPlan(userId: string, planKey: unknown, periodEnd?: unknown) {
    const plan =
      typeof planKey === 'string' ? await this.plans.get(planKey) : undefined;
    if (!plan) throw new BadRequestException('Unknown plan.');
    let endsAt: Date | null = null;
    if (periodEnd !== undefined && periodEnd !== null && periodEnd !== '') {
      endsAt =
        typeof periodEnd === 'string' || typeof periodEnd === 'number'
          ? new Date(periodEnd)
          : new Date(NaN);
      if (Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException('periodEnd is not a valid date.');
      }
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const sub = await this.subscriptionFor(userId);
    const switching = plan.key !== sub.plan;
    if (switching) {
      await this.cancelNow(sub).catch((err: unknown) =>
        this.log.warn(`Could not cancel the subscription: ${String(err)}`),
      );
    }
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: plan.key,
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        dodoSubscriptionId: switching ? null : sub.dodoSubscriptionId,
        dodoMode: switching ? null : sub.dodoMode,
        currentPeriodEnd: endsAt,
      },
    });
    if (switching || sub.status !== 'ACTIVE') {
      await this.notify(
        userId,
        `Your plan is now ${plan.name}`,
        `Our team has moved your account to the ${plan.name} plan` +
          (endsAt ? `, until ${fmtDate(endsAt)}` : '') +
          (sub.dodoSubscriptionId && switching
            ? '. Your previous subscription is cancelled, so you will not be charged for it again.'
            : '.'),
      );
    }
    return updated;
  }

  async adminCancel(userId: string) {
    const sub = await this.subscriptionFor(userId);
    await this.cancelNow(sub);
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: FREE_KEY,
        status: 'ACTIVE',
        dodoSubscriptionId: null,
        dodoMode: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    });
    if (sub.plan !== FREE_KEY && sub.status !== 'EXPIRED') {
      await this.notify(
        userId,
        'Your subscription is cancelled',
        'Our team has cancelled your subscription and you will not be charged again. Your account is on the Free plan now.',
      );
    }
    return updated;
  }

  /**
   * A developer account (its checkouts go to Dodo's test mode, no real
   * money) or a normal one. Refused while a Dodo subscription is not over:
   * a test subscription must not outlive the switch and keep a paid plan for
   * free, and a live one is not moved into test mode.
   */
  async adminSetTestPayments(userId: string, on: unknown) {
    if (typeof on !== 'boolean') {
      throw new BadRequestException('"on" must be true or false.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, testPayments: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (user.testPayments === on) return user;
    const sub = await this.subscriptionFor(userId);
    if (sub.dodoSubscriptionId && sub.status !== 'EXPIRED') {
      throw new BadRequestException(
        `${user.email} has a ${(await this.modeOf(sub)) === 'test' ? 'test' : 'live'} subscription that is not over. Cancel it under Subscriptions first, then switch.`,
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { testPayments: on },
      select: { id: true, email: true, testPayments: true },
    });
  }

  /** Read the truth back from Dodo when a webhook was missed. */
  async adminRefresh(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.dodoSubscriptionId) {
      throw new BadRequestException('No Dodo subscription on this account.');
    }
    return this.refreshFromDodo(sub);
  }

  // ---- payments

  /**
   * Every payment in one mode, with totals for the top of the page. Totals
   * are what reaches the Dodo balance (US dollars, after fees), less refunds.
   */
  async adminPayments(modeRaw?: string) {
    const mode: DodoMode =
      modeRaw === 'live' || modeRaw === 'test'
        ? modeRaw
        : await this.dodo.mode();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [rows, all] = await Promise.all([
      this.prisma.payment.findMany({
        where: { mode },
        orderBy: { paidAt: 'desc' },
        take: 500,
      }),
      this.prisma.payment.findMany({
        where: { mode },
        select: {
          amountCents: true,
          refundedCents: true,
          settlementCents: true,
          paidAt: true,
        },
      }),
    ]);
    // Settled dollars, scaled down by whatever share was refunded.
    const net = (list: typeof all) =>
      Math.round(
        list.reduce((sum, p) => {
          const settled = p.settlementCents ?? p.amountCents;
          const kept = p.amountCents ? 1 - p.refundedCents / p.amountCents : 1;
          return sum + settled * kept;
        }, 0),
      );
    const refunded = Math.round(
      all.reduce(
        (sum, p) =>
          sum +
          (p.settlementCents ?? p.amountCents) *
            (p.amountCents ? p.refundedCents / p.amountCents : 0),
        0,
      ),
    );
    return {
      mode,
      totals: {
        thisMonthCents: net(all.filter((p) => p.paidAt >= monthStart)),
        allTimeCents: net(all),
        refundedCents: refunded,
        count: all.length,
      },
      payments: rows.map((p) => ({ ...p, number: invoiceNumber(p.number) })),
    };
  }

  /** Refund all that is left of a payment, or `amount` (in its currency) of it. */
  async adminRefund(paymentId: string, amountRaw?: unknown) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (!payment.dodoPaymentId) {
      throw new BadRequestException(
        'This is an old PayPal payment; refund it in PayPal.',
      );
    }
    const left = payment.amountCents - payment.refundedCents;
    if (payment.status === 'REVERSED' || left <= 0) {
      throw new BadRequestException('Nothing left to refund on this payment.');
    }
    const cents =
      amountRaw === undefined || amountRaw === null || amountRaw === ''
        ? left
        : Math.round(Number(amountRaw) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || cents > left) {
      throw new BadRequestException(
        `Refund between ${fmtMoney(1, payment.currency)} and ${fmtMoney(left, payment.currency)}.`,
      );
    }
    const mode: DodoMode = payment.mode === 'live' ? 'live' : 'test';
    const whole = cents === payment.amountCents;
    // A partial refund names the product it is for.
    const productId = whole
      ? undefined
      : (await this.dodo.getPayment(payment.dodoPaymentId, mode))
          .product_cart?.[0]?.product_id;
    if (!whole && !productId) {
      throw new BadRequestException(
        'Dodo did not say which product this payment was for, so a partial refund cannot be sent. Refund the whole payment, or do it in the Dodo dashboard.',
      );
    }
    const refund = await this.dodo.refund(
      mode,
      { paymentId: payment.dodoPaymentId, productId },
      whole ? undefined : cents,
    );
    if (refund.status === 'succeeded') {
      await this.applyRefund(payment, refund.refund_id, cents);
    }
    return {
      payment: await this.prisma.payment.findUnique({
        where: { id: paymentId },
      }),
      // Dodo may review a refund first; the webhook books it when it clears.
      pending: refund.status !== 'succeeded',
    };
  }

  adminInvoiceSettings() {
    return this.invoiceSettings();
  }

  async adminSaveInvoiceSettings(input: Record<string, unknown>) {
    const fields: [string, (typeof INVOICE_KEYS)[number]][] = [
      ['name', 'SELLER_NAME'],
      ['address', 'SELLER_ADDRESS'],
      ['email', 'SELLER_EMAIL'],
      ['taxId', 'SELLER_TAX_ID'],
      ['note', 'NOTE'],
    ];
    for (const [field, key] of fields) {
      const value = input?.[field];
      if (typeof value !== 'string') continue;
      await this.settings.set(`INVOICE_${key}`, value.trim().slice(0, 600));
    }
    return this.invoiceSettings();
  }

  // ---- plans

  async adminPlans() {
    return { mode: await this.dodo.mode(), plans: await this.plans.all() };
  }

  /**
   * Save a plan. A new price is pushed to the plan's Dodo products, so new
   * subscribers pay it. Dodo never reprices existing subscriptions: people
   * already paying keep their price.
   */
  async adminSavePlan(input: PlanInput) {
    const before = await this.plans.get(input.key.toUpperCase());
    const saved = await this.plans.upsert(input);
    const warnings: string[] = [];
    if (!before) return { plan: saved, warnings };

    // Prices are in dollars only: Dodo converts them for customers in India.
    // A fixed rupee price left on a product from before is taken off.
    for (const mode of ['test', 'live'] as const) {
      if (!(await this.dodo.configured(mode))) continue;
      for (const interval of ['month', 'year'] as const) {
        const id = BillingService.productFor(saved, mode, interval);
        if (!id) continue;
        try {
          await this.dodo.clearRupeePrice(mode, id);
        } catch (err) {
          warnings.push(
            `${mode} (rupee price): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const changes: [
      boolean,
      number,
      'Month' | 'Year',
      DodoMode,
      string | null,
    ][] = [];
    for (const mode of ['test', 'live'] as const) {
      changes.push(
        [
          before.priceUsd !== saved.priceUsd,
          saved.priceUsd,
          'Month',
          mode,
          mode === 'live' ? saved.dodoMonthlyIdLive : saved.dodoMonthlyIdTest,
        ],
        [
          before.priceYearlyUsd !== saved.priceYearlyUsd,
          saved.priceYearlyUsd,
          'Year',
          mode,
          mode === 'live' ? saved.dodoYearlyIdLive : saved.dodoYearlyIdTest,
        ],
      );
    }
    for (const [changed, price, interval, mode, id] of changes) {
      if (!changed || !id || !(await this.dodo.configured(mode))) continue;
      try {
        await this.dodo.updateProductPrice(
          mode,
          id,
          Math.round(price * 100),
          interval,
        );
      } catch (err) {
        warnings.push(
          `${mode}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { plan: saved, warnings };
  }

  /** Create this plan on Dodo (current or given mode, monthly or yearly) and remember the product. */
  async adminCreateOnDodo(
    key: string,
    mode?: DodoMode,
    interval: BillingInterval = 'month',
  ) {
    const plan = await this.plans.get(key);
    if (!plan) throw new NotFoundException('Unknown plan.');
    if (plan.key === FREE_KEY || plan.priceUsd <= 0) {
      throw new BadRequestException('Free plans do not go to Dodo.');
    }
    const m = mode ?? (await this.dodo.mode());
    const existing = BillingService.productFor(plan, m, interval);
    if (existing)
      throw new BadRequestException(`Already on Dodo ${m}: ${existing}`);

    const yearly = interval === 'year';
    const id = await this.dodo.createProduct(m, {
      name: `${PRODUCT_NAME} ${plan.name}${yearly ? ' (yearly)' : ''}`,
      priceCents: Math.round(
        (yearly ? plan.priceYearlyUsd : plan.priceUsd) * 100,
      ),
      interval: yearly ? 'Year' : 'Month',
    });
    const field = yearly
      ? m === 'live'
        ? 'dodoYearlyIdLive'
        : 'dodoYearlyIdTest'
      : m === 'live'
        ? 'dodoMonthlyIdLive'
        : 'dodoMonthlyIdTest';
    return this.plans.upsert({ key: plan.key, [field]: id });
  }

  // ---- Dodo keys

  async adminDodoSettings() {
    const keys: Record<
      string,
      { value: string; set: boolean; secret: boolean }
    > = {};
    for (const k of DODO_KEYS) {
      const value = await this.settings.get(`DODO_${k}`);
      keys[k] = {
        value: SettingsService.mask(value),
        set: Boolean(value),
        secret: true,
      };
    }
    const api = (this.config.get<string>('PUBLIC_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    return {
      mode: await this.dodo.mode(),
      keys,
      webhookUrl: `${api || '<your-api-url>'}/billing/webhook`,
      webhookEvents: WEBHOOK_EVENTS,
      configured: {
        test: await this.dodo.configured('test'),
        live: await this.dodo.configured('live'),
      },
    };
  }

  async adminSaveDodo(input: Record<string, string>) {
    if (input.MODE !== undefined) {
      if (input.MODE !== 'test' && input.MODE !== 'live') {
        throw new BadRequestException('Mode must be test or live.');
      }
      if (
        input.MODE === 'live' &&
        !(await this.dodo.configured('live')) &&
        !input.LIVE_API_KEY
      ) {
        throw new BadRequestException(
          'Add the live API key before switching to live.',
        );
      }
    }
    for (const k of DODO_KEYS) {
      const value = input[k];
      // A blank field means "unchanged" - the UI never has the real value.
      if (typeof value !== 'string' || value === '') continue;
      await this.settings.set(`DODO_${k}`, value.trim(), true);
    }
    if (input.MODE) await this.settings.set('DODO_MODE', input.MODE);
    return this.adminDodoSettings();
  }

  adminTestDodo(mode: DodoMode) {
    return this.dodo.test(mode);
  }
}
