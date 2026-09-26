import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Payment, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { PaypalClient, PaypalMode, PaypalSubscription } from './paypal.client';
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

type Resource = 'widgets' | 'sources';

/** The parts of a PayPal webhook we read. Everything is optional: it is untrusted input. */
type WebhookResource = {
  id?: string;
  plan_id?: string;
  custom_id?: string;
  billing_agreement_id?: string;
  billing_info?: { next_billing_time?: string };
  amount?: { total?: string; currency?: string };
  /** Sales: PayPal's cut. */
  transaction_fee?: { value?: string; currency?: string };
  create_time?: string;
  /** Refunds and reversals: the payment they undo. */
  sale_id?: string;
};

const REFUND_EVENTS = ['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'];

/** Invoice settings the super admin fills in (who the seller is). */
const INVOICE_KEYS = [
  'SELLER_NAME',
  'SELLER_ADDRESS',
  'SELLER_EMAIL',
  'SELLER_TAX_ID',
  'NOTE',
] as const;

export const invoiceNumber = (n: number) => `MSI-${String(n).padStart(5, '0')}`;
const toCents = (v?: string) => Math.round(Math.abs(Number(v ?? 0)) * 100);
const fmtMoney = (cents: number, currency: string) =>
  `${currency === 'USD' ? '$' : `${currency} `}${(cents / 100).toFixed(2)}`;
type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: WebhookResource;
};

const DAY_MS = 86_400_000;
// PayPal retries a failed renewal for a few days; after five without the
// money, the account drops to Free limits until it is paid.
const OVERDUE_AFTER_MS = 5 * DAY_MS;
// Yearly customers are told a week before the next charge.
const REMIND_BEFORE_MS = 7 * DAY_MS;

/** "12 Oct 2026" - the same in every email, whatever the server locale. */
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const fmtUsd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** The emails for states PayPal puts a subscription in. */
const STATUS_MAIL: Record<'SUSPENDED' | 'EXPIRED', [string, string]> = {
  SUSPENDED: [
    'Your subscription is paused',
    'PayPal has paused your subscription, usually after payments did not go through. Your widgets are on Free limits until it is sorted out: ' +
      'update your payment method or reactivate the subscription in PayPal, or choose a plan again from Billing.',
  ],
  EXPIRED: [
    'Your subscription has ended',
    'Your paid plan has ended and your account is on the Free plan now. You can subscribe again any time from Billing.',
  ],
};

const fmtViews = (views: number) =>
  views >= UNLIMITED ? 'unlimited' : views.toLocaleString();

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly paypal: PaypalClient,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private appUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3002')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
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
   * support gave until a date. A PayPal renewal gets its grace from the
   * overdue check instead, since the payment lands after the date.
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
        (Boolean(sub.paypalSubscriptionId) ||
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

  private async paypalPlanId(
    plan: Plan,
    mode?: PaypalMode,
    interval: BillingInterval = 'month',
  ): Promise<string | undefined> {
    const m = mode ?? (await this.paypal.mode());
    const id =
      interval === 'year'
        ? m === 'live'
          ? plan.paypalYearlyIdLive
          : plan.paypalYearlyIdSandbox
        : m === 'live'
          ? plan.paypalPlanIdLive
          : plan.paypalPlanIdSandbox;
    return id ?? undefined;
  }

  /** A subscription PayPal no longer bills: nothing there to cancel. */
  private static ended(sub: Subscription) {
    return sub.status === 'CANCELLED' || sub.status === 'EXPIRED';
  }

  /** Whether a PayPal plan id is one of this plan's yearly ones. */
  private static isYearlyId(plan: Plan, paypalPlanId?: string) {
    return (
      Boolean(paypalPlanId) &&
      (plan.paypalYearlyIdSandbox === paypalPlanId ||
        plan.paypalYearlyIdLive === paypalPlanId)
    );
  }

  async overview(userId: string) {
    const [sub, plan, widgets, sources, usage, all, enabled] =
      await Promise.all([
        this.subscriptionFor(userId),
        this.planFor(userId),
        this.prisma.widget.count({ where: { userId } }),
        this.prisma.source.count({ where: { userId } }),
        this.prisma.usage.findUnique({
          where: { userId_period: { userId, period: currentPeriod() } },
        }),
        this.plans.all(),
        this.paypal.configured(),
      ]);

    const plans = [];
    for (const p of all.filter((x) => x.active)) {
      plans.push({
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
          (enabled && Boolean(await this.paypalPlanId(p))),
        availableYearly:
          p.key !== FREE_KEY &&
          enabled &&
          Boolean(await this.paypalPlanId(p, undefined, 'year')),
      });
    }

    return {
      plan: { ...plan, id: plan.key },
      subscription: {
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        pendingPlan: sub.pendingPlan,
        interval: sub.interval,
        hasPaypal: Boolean(sub.paypalSubscriptionId),
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
    };
  }

  // --------------------------------------------------------------- checkout

  /** Creates a PayPal subscription and returns the page the user approves it on. */
  async startCheckout(userId: string, planKey: string, intervalRaw?: string) {
    const plan = await this.plans.get(String(planKey ?? ''));
    if (!plan || plan.key === FREE_KEY || !plan.active) {
      throw new BadRequestException('Pick a paid plan.');
    }
    const interval: BillingInterval = intervalRaw === 'year' ? 'year' : 'month';
    const paypalPlan = await this.paypalPlanId(plan, undefined, interval);
    if (!paypalPlan || !(await this.paypal.configured())) {
      throw new BadRequestException(
        `${plan.name}${interval === 'year' ? ' yearly' : ''} is not available yet.`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const sub = await this.subscriptionFor(userId);
    if (
      sub.status === 'ACTIVE' &&
      sub.plan === plan.key &&
      sub.interval === interval &&
      !sub.cancelAtPeriodEnd
    ) {
      throw new BadRequestException(
        `You are already on ${plan.name}${interval === 'year' ? ' yearly' : ''}.`,
      );
    }

    // Taking back a cancelled plan that is still paid up: the new
    // subscription's first charge waits for the end of that period, so no
    // day is paid for twice.
    const resumeAt =
      sub.status === 'CANCELLED' &&
      sub.plan === plan.key &&
      sub.interval === interval &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() > Date.now() + 60 * 60 * 1000
        ? sub.currentPeriodEnd
        : null;

    const created = await this.paypal.createSubscription({
      planId: paypalPlan,
      customId: userId,
      email: user.email,
      returnUrl: `${this.appUrl()}/dashboard/billing?paypal=return`,
      cancelUrl: `${this.appUrl()}/dashboard/billing?paypal=cancel`,
      startTime: resumeAt?.toISOString(),
    });

    const approve = created.links.find((l) => l.rel === 'approve')?.href;
    if (!approve)
      throw new BadRequestException('PayPal did not return an approval link.');

    await this.prisma.subscription.update({
      where: { userId },
      data: { pendingPlan: plan.key },
    });
    return { approveUrl: approve, subscriptionId: created.id };
  }

  /**
   * Called when PayPal sends the user back. The webhook will say the same thing
   * a few seconds later, but confirming here means the page is right on arrival.
   */
  async confirm(userId: string, subscriptionId: string) {
    if (!subscriptionId) {
      throw new BadRequestException('Missing subscription id.');
    }
    const remote = await this.paypal.getSubscription(subscriptionId);
    // The id comes from a query string; make sure it is this user's.
    if (remote.custom_id !== userId) {
      throw new ForbiddenException(
        'That subscription belongs to someone else.',
      );
    }
    if (remote.status !== 'ACTIVE' && remote.status !== 'APPROVED') {
      return { status: remote.status };
    }
    await this.activate(
      userId,
      remote.id,
      remote.plan_id,
      remote.billing_info?.next_billing_time,
    );
    return { status: 'ACTIVE' };
  }

  async cancel(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.paypalSubscriptionId || sub.plan === FREE_KEY) {
      throw new BadRequestException('There is no paid subscription to cancel.');
    }
    if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
      throw new BadRequestException('This subscription is already cancelled.');
    }
    const paypalId = sub.paypalSubscriptionId;
    await this.paypal
      .cancelSubscription(paypalId, 'Cancelled by the customer')
      .catch(async (err: unknown) => {
        // Already ended on PayPal (a webhook we missed): nothing to stop.
        const remote = await this.paypal
          .getSubscription(paypalId)
          .catch(() => null);
        if (remote?.status === 'CANCELLED' || remote?.status === 'EXPIRED')
          return;
        throw err;
      });
    await this.markCancelled(userId, sub);
    return { ok: true };
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

  // --------------------------------------------------------------- webhooks

  async handleWebhook(
    headers: Record<string, string | undefined>,
    body: unknown,
  ) {
    const event = (body ?? {}) as WebhookEvent;
    if (typeof event.id !== 'string' || typeof event.event_type !== 'string') {
      throw new BadRequestException('Not a PayPal event.');
    }
    const eventId = event.id;
    const eventType = event.event_type;
    if (!(await this.paypal.verifyWebhook(headers, event))) {
      this.log.warn(`Rejected unverified webhook ${eventId}`);
      throw new ForbiddenException('Signature check failed.');
    }

    // PayPal retries deliveries; process each event exactly once.
    const seen = await this.prisma.billingEvent.findUnique({
      where: { id: eventId },
    });
    if (seen) return { ok: true, duplicate: true };

    const resource: WebhookResource = event.resource ?? {};
    const subscriptionId = eventType.startsWith('PAYMENT.SALE')
      ? resource.billing_agreement_id
      : resource.id;
    let userId = await this.userForSubscription(
      subscriptionId,
      resource.custom_id,
    );
    if (!userId && REFUND_EVENTS.includes(eventType)) {
      const paid = await this.prisma.payment.findUnique({
        where: { paypalSaleId: resource.sale_id ?? resource.id ?? '' },
      });
      userId = paid?.userId ?? null;
    }
    if (!userId && eventType === 'PAYMENT.SALE.COMPLETED' && subscriptionId) {
      // The first payment of a new subscription can land before we have
      // activated it; PayPal knows whose it is. A failed lookup throws, and
      // PayPal delivers the event again later.
      const remote = await this.paypal
        .getSubscription(subscriptionId)
        .catch((err: unknown) => {
          // Not a subscription PayPal knows here: not ours, nothing to retry.
          if (err instanceof Error && err.message.includes('PayPal 404'))
            return null;
          throw err;
        });
      userId = await this.userForSubscription(undefined, remote?.custom_id);
    }

    await this.prisma.billingEvent.create({
      data: {
        id: eventId,
        type: eventType,
        userId,
        payload: event,
      },
    });
    if (!userId) {
      this.log.warn(
        `Webhook ${eventType} for unknown subscription ${subscriptionId}`,
      );
      return { ok: true };
    }

    try {
      await this.applyWebhook(eventType, userId, resource, subscriptionId);
    } catch (err) {
      // Forget the event, so PayPal's retry is processed instead of skipped.
      await this.prisma.billingEvent
        .delete({ where: { id: eventId } })
        .catch(() => undefined);
      throw err;
    }
    return { ok: true };
  }

  private async applyWebhook(
    eventType: string,
    userId: string,
    resource: WebhookResource,
    subscriptionId?: string,
  ) {
    // Switching plans, or support changing one by hand, cancels the old PayPal
    // subscription - and PayPal then reports on that old one. Only news about
    // the subscription the account is on now may change it.
    const current = (await this.subscriptionFor(userId)).paypalSubscriptionId;
    const aboutAnother = Boolean(subscriptionId) && subscriptionId !== current;

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        if (!resource.id) break;
        // A late ACTIVATED for a subscription already replaced or cancelled
        // must not take over (and cancel) the one the account has now.
        const remote = await this.paypal
          .getSubscription(resource.id)
          .catch(() => null);
        if (
          remote &&
          remote.status !== 'ACTIVE' &&
          remote.status !== 'APPROVED'
        )
          break;
        await this.activate(
          userId,
          resource.id,
          resource.plan_id,
          resource.billing_info?.next_billing_time,
        );
        break;
      }
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
        // Back after a suspension, usually once a failed payment went through.
        if (!resource.id || aboutAnother) break;
        await this.activate(
          userId,
          resource.id,
          resource.plan_id,
          resource.billing_info?.next_billing_time,
        );
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        if (aboutAnother) break;
        await this.markCancelled(userId, await this.subscriptionFor(userId));
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        if (aboutAnother) break;
        await this.setStatus(userId, 'SUSPENDED');
        break;
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        if (aboutAnother) break;
        await this.setStatus(userId, 'EXPIRED');
        break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        if (aboutAnother) break;
        await this.notify(
          userId,
          'A payment did not go through',
          'PayPal could not collect your latest payment and will try again. Please check your payment method in PayPal. ' +
            'If the payment is still missing five days after your renewal date, your widgets move to Free limits until it goes through.',
        );
        break;
      case 'PAYMENT.SALE.COMPLETED':
        // Every charge is recorded (and gets an invoice), even one on an old
        // or not-yet-activated subscription; only the current one moves dates.
        await this.paymentReceived(
          userId,
          resource,
          subscriptionId,
          aboutAnother,
        );
        break;
      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED': {
        const paid = await this.prisma.payment.findUnique({
          where: { paypalSaleId: resource.sale_id ?? resource.id ?? '' },
        });
        if (!paid || !resource.id) break;
        await this.applyRefund(
          paid,
          resource.id,
          toCents(resource.amount?.total),
          eventType === 'PAYMENT.SALE.REVERSED',
        );
        break;
      }
      default:
        break;
    }
  }

  private async userForSubscription(
    subscriptionId?: string,
    customId?: string,
  ) {
    if (subscriptionId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { paypalSubscriptionId: subscriptionId },
      });
      if (sub) return sub.userId;
    }
    if (customId) {
      const user = await this.prisma.user.findUnique({
        where: { id: customId },
      });
      if (user) return user.id;
    }
    return null;
  }

  private async activate(
    userId: string,
    paypalId: string,
    paypalPlan?: string,
    nextBilling?: string,
  ) {
    const before = await this.subscriptionFor(userId);
    const matched = paypalPlan
      ? await this.plans.byPaypalId(paypalPlan)
      : undefined;
    const plan =
      matched ??
      (before.pendingPlan
        ? await this.plans.get(before.pendingPlan)
        : undefined) ??
      // The same subscription coming back (after a suspension) keeps its plan.
      (before.paypalSubscriptionId === paypalId
        ? await this.plans.get(before.plan)
        : undefined);
    if (!plan) {
      this.log.error(
        `Activation for ${userId} with unknown PayPal plan ${paypalPlan}`,
      );
      return;
    }

    // Switching plans creates a new PayPal subscription; stop billing the old
    // one (unless it has already ended).
    if (
      before.paypalSubscriptionId &&
      before.paypalSubscriptionId !== paypalId &&
      !BillingService.ended(before)
    ) {
      await this.paypal
        .cancelSubscription(
          before.paypalSubscriptionId,
          'Replaced by a new plan',
        )
        .catch((err) =>
          this.log.warn(`Could not cancel old subscription: ${err}`),
        );
    }

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: plan.key,
        status: 'ACTIVE',
        paypalSubscriptionId: paypalId,
        pendingPlan: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: nextBilling
          ? new Date(nextBilling)
          : before.paypalSubscriptionId === paypalId
            ? before.currentPeriodEnd
            : null,
        // Only a matched PayPal id says which one it is; otherwise keep it.
        interval: matched
          ? BillingService.isYearlyId(matched, paypalPlan)
            ? 'year'
            : 'month'
          : before.interval,
      },
    });

    const samePlan =
      before.plan === plan.key && before.paypalSubscriptionId === paypalId;
    if (samePlan && before.status === 'ACTIVE') return;
    if (samePlan) {
      // The same subscription back after a pause or an overdue payment.
      await this.notify(
        userId,
        `Your ${plan.name} plan is active again`,
        `Your ${plan.name} subscription is running again, with all its limits.` +
          (nextBilling
            ? ` Next payment: ${fmtDate(new Date(nextBilling))}.`
            : ''),
      );
      return;
    }
    const yearly = matched
      ? BillingService.isYearlyId(matched, paypalPlan)
      : before.interval === 'year';
    // A cancelled plan taken back before it ran out: billing picks up where
    // the paid period ends.
    if (
      before.status === 'CANCELLED' &&
      before.plan === plan.key &&
      before.currentPeriodEnd &&
      before.currentPeriodEnd > new Date()
    ) {
      await this.notify(
        userId,
        `Your ${plan.name} plan continues`,
        `You have subscribed to ${plan.name} again, so it will not end on ${fmtDate(before.currentPeriodEnd)}. ` +
          `Nothing more is charged until then; after that it renews ${yearly ? 'yearly' : 'monthly'} through PayPal. ` +
          'You can cancel any time from Billing.',
      );
      return;
    }
    await this.notify(
      userId,
      `Welcome to ${plan.name}`,
      `Your ${plan.name} plan is active: ${plan.widgets} widgets, ${plan.sources} domains, ` +
        `${plan.reviews} reviews per widget, ${fmtViews(plan.views)} views a month and reviews updated every ${plan.refreshHours} hours. ` +
        `It is billed ${yearly ? 'yearly' : 'monthly'} through PayPal` +
        (nextBilling
          ? `; the next payment is on ${fmtDate(new Date(nextBilling))}.`
          : '.') +
        ' You can cancel any time from Billing.',
    );
  }

  private async markCancelled(userId: string, sub: Subscription) {
    if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') return;
    const name = (await this.plans.get(sub.plan))?.name ?? sub.plan;
    const paidAhead =
      sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
        ? sub.currentPeriodEnd
        : null;
    await this.prisma.subscription.update({
      where: { userId },
      // Nothing paid ahead: it ends now rather than waiting for a date.
      data: paidAhead
        ? { status: 'CANCELLED', cancelAtPeriodEnd: true }
        : { status: 'EXPIRED', cancelAtPeriodEnd: false },
    });
    await this.notify(
      userId,
      'Your subscription is cancelled',
      paidAhead
        ? `Your ${name} subscription is cancelled and you will not be charged again. ` +
            `You keep ${name} until ${fmtDate(paidAhead)}; after that your account moves to the Free plan. ` +
            'Changed your mind? You can subscribe again from Billing.'
        : `Your ${name} subscription is cancelled and you will not be charged again. ` +
            'Your account is on the Free plan now.',
    );
  }

  private async setStatus(userId: string, status: keyof typeof STATUS_MAIL) {
    // PayPal can report the same state twice; one email is enough.
    if ((await this.subscriptionFor(userId)).status === status) return;
    await this.prisma.subscription.update({
      where: { userId },
      data: { status },
    });
    const [subject, line] = STATUS_MAIL[status];
    await this.notify(userId, subject, line);
  }

  private async paymentReceived(
    userId: string,
    sale: WebhookResource,
    subscriptionId?: string,
    aboutAnother = false,
  ) {
    // A successful charge also tells us the new end of the paid period.
    const remote = subscriptionId
      ? await this.paypal.getSubscription(subscriptionId).catch(() => null)
      : null;
    const next = remote?.billing_info?.next_billing_time;
    const payment = await this.recordPayment(
      userId,
      sale,
      subscriptionId,
      remote?.plan_id,
      next,
    );
    // Seen before (PayPal sent the same payment again): the dates below are
    // safe to set twice, but the customer gets one receipt.
    const repeat = payment === 'duplicate';

    let wasOverdue = false;
    if (subscriptionId && !aboutAnother) {
      const sub = await this.subscriptionFor(userId);
      wasOverdue = sub.status === 'PAST_DUE';
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          ...(next ? { currentPeriodEnd: new Date(next) } : {}),
          // An overdue renewal that went through after all.
          ...(wasOverdue ? { status: 'ACTIVE' } : {}),
        },
      });
    }
    if (repeat) return;
    // The first charge of a subscription comes with the welcome email; it
    // needs no "continues as before".
    const first =
      Boolean(payment && subscriptionId) &&
      (await this.prisma.payment.count({
        where: { paypalSubscriptionId: subscriptionId },
      })) === 1;
    const parts = [
      payment
        ? `Thanks - we received ${fmtMoney(payment.amountCents, payment.currency)} for ${payment.planName} (${payment.interval === 'year' ? 'yearly' : 'monthly'}).`
        : 'Thanks - we received your payment.',
      wasOverdue
        ? 'Your plan is active again, with all its limits.'
        : first
          ? ''
          : 'Your plan continues as before.',
      next ? `Next payment: ${fmtDate(new Date(next))}.` : '',
    ];
    await this.notify(
      userId,
      payment
        ? `Payment received - invoice ${invoiceNumber(payment.number)}`
        : 'Payment received',
      parts.filter(Boolean).join(' '),
      payment
        ? {
            label: 'View invoice',
            url: `${this.appUrl()}/invoice/${payment.id}`,
          }
        : undefined,
    );
  }

  /**
   * One row per PayPal charge: what it was for, the period it pays, and who
   * paid. Returns 'duplicate' when this charge is already recorded, and null
   * when the event does not describe a usable payment.
   */
  private async recordPayment(
    userId: string,
    sale: WebhookResource,
    subscriptionId: string | undefined,
    paypalPlanId: string | undefined,
    next: string | undefined,
  ): Promise<Payment | 'duplicate' | null> {
    const amountCents = toCents(sale.amount?.total);
    if (!sale.id || amountCents <= 0) return null;
    // Checked first so a repeat does not use up an invoice number (a failed
    // insert still advances the sequence); the unique index covers races.
    if (
      await this.prisma.payment.findUnique({
        where: { paypalSaleId: sale.id },
        select: { id: true },
      })
    ) {
      return 'duplicate';
    }
    const [user, sub] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.subscriptionFor(userId),
    ]);
    if (!user) return null;
    const matched = paypalPlanId
      ? await this.plans.byPaypalId(paypalPlanId)
      : undefined;
    const plan =
      matched ??
      (await this.plans.get(
        sub.paypalSubscriptionId === subscriptionId
          ? sub.plan
          : (sub.pendingPlan ?? sub.plan),
      ));
    const stamped = sale.create_time ? new Date(sale.create_time) : null;
    const paidAt =
      stamped && !Number.isNaN(stamped.getTime()) ? stamped : new Date();
    try {
      return await this.prisma.payment.create({
        data: {
          userId,
          paypalSaleId: sale.id,
          paypalSubscriptionId: subscriptionId ?? null,
          mode: await this.paypal.mode(),
          plan: plan?.key ?? sub.plan,
          planName: plan?.name ?? sub.plan,
          interval: matched
            ? BillingService.isYearlyId(matched, paypalPlanId)
              ? 'year'
              : 'month'
            : sub.interval,
          amountCents,
          currency: sale.amount?.currency ?? 'USD',
          feeCents: sale.transaction_fee?.value
            ? toCents(sale.transaction_fee.value)
            : null,
          periodStart: paidAt,
          periodEnd: next ? new Date(next) : null,
          customerName: user.name,
          customerEmail: user.email,
          paidAt,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw err;
    }
  }

  /**
   * Books a refund (or a reversal - a chargeback) against a payment, once per
   * PayPal refund id: a refund made from the admin panel and the webhook
   * PayPal then sends about it are the same refund.
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
    // A chargeback is between the customer and their bank; no email for it.
    if (now.userId && !reversed && refunded > now.refundedCents) {
      await this.notify(
        now.userId,
        `Refund for invoice ${invoiceNumber(now.number)}`,
        `We have refunded ${fmtMoney(refunded - now.refundedCents, now.currency)} of your ` +
          `${fmtMoney(now.amountCents, now.currency)} payment for ${now.planName}. ` +
          'PayPal returns it to the account or card you paid with; it can take a few days to show.',
        {
          label: 'View invoice',
          url: `${this.appUrl()}/invoice/${now.id}`,
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
    // Not awaited: a customer coming back from PayPal, or a webhook, must not
    // wait on the mail server. send() never throws.
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
      test: p.mode === 'sandbox',
    }));
  }

  /** Name, address and tax id printed on the customer's invoices. */
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

  /** Everything an invoice shows. Its owner or an admin may open it. */
  async invoice(viewer: { id: string; role: string }, paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: String(paymentId ?? '') },
    });
    if (!p || (p.userId !== viewer.id && viewer.role !== 'ADMIN')) {
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
      test: p.mode === 'sandbox',
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
      paypal: { transactionId: p.paypalSaleId },
    };
  }

  private async invoiceSettings() {
    const out: Record<string, string> = {};
    for (const k of INVOICE_KEYS) {
      out[k] = (await this.settings.get(`INVOICE_${k}`)) ?? '';
    }
    return {
      name: out.SELLER_NAME || 'My Social Items',
      address: out.SELLER_ADDRESS,
      email: out.SELLER_EMAIL,
      taxId: out.SELLER_TAX_ID,
      note: out.NOTE,
    };
  }

  // ------------------------------------------------------ overdue renewals

  /**
   * Safety net for renewals, run on a timer. A paid subscription whose
   * renewal date passed a few days ago with no payment reaching us is checked
   * with PayPal: paid after all (a webhook went missing) - the new period is
   * recorded; money still owed - the account drops to Free limits (PAST_DUE)
   * until the payment goes through; ended by PayPal - that status is taken
   * over. Without this, a renewal that fails but is not yet suspended would
   * keep a paid plan running for free.
   */
  async reconcileOverdue(): Promise<{ checked: number }> {
    if (!(await this.paypal.configured())) return { checked: 0 };
    const cutoff = new Date(Date.now() - OVERDUE_AFTER_MS);
    let checked = 0;
    let after: string | undefined;
    // Page by id, so a long list of overdue accounts cannot hide newer ones.
    for (;;) {
      const due = await this.prisma.subscription.findMany({
        where: {
          paypalSubscriptionId: { not: null },
          OR: [
            { status: 'ACTIVE', currentPeriodEnd: { lt: cutoff } },
            { status: 'PAST_DUE' },
          ],
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const sub of due) {
        checked++;
        await this.checkOverdue(sub).catch((err: unknown) =>
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

  private async checkOverdue(sub: Subscription) {
    const paypalId = sub.paypalSubscriptionId as string;
    const remote = await this.paypal.getSubscription(paypalId);
    // Charges PayPal made while no webhook reached us still get invoices.
    await this.syncPayments(sub.userId, remote, sub.interval).catch(
      (err: unknown) =>
        this.log.warn(`Payment sync failed for ${sub.userId}: ${String(err)}`),
    );
    const info = remote.billing_info;
    const next = info?.next_billing_time;
    const owed = Number(info?.outstanding_balance?.value ?? 0);
    const failedAt = Date.parse(info?.last_failed_payment?.time ?? '') || 0;
    const paidAt = Date.parse(info?.last_payment?.time ?? '') || 0;
    const unpaid = owed > 0 || failedAt > paidAt;

    if (remote.status === 'ACTIVE' && unpaid) {
      if (sub.status === 'PAST_DUE') return;
      await this.prisma.subscription.update({
        where: { userId: sub.userId },
        data: { status: 'PAST_DUE' },
      });
      await this.notify(
        sub.userId,
        'Your payment is overdue',
        'PayPal has not been able to collect your renewal for five days, so your account is on Free limits for now. ' +
          'Update your payment method in PayPal and your plan comes back as soon as the payment goes through.',
      );
    } else if (remote.status === 'ACTIVE' || remote.status === 'APPROVED') {
      await this.prisma.subscription.update({
        where: { userId: sub.userId },
        data: {
          status: 'ACTIVE',
          ...(next ? { currentPeriodEnd: new Date(next) } : {}),
        },
      });
      // Paid after all, and no webhook said so: the customer hears it here.
      if (sub.status === 'PAST_DUE') {
        const name = (await this.plans.get(sub.plan))?.name ?? sub.plan;
        await this.notify(
          sub.userId,
          `Your ${name} plan is active again`,
          `Thanks - your payment went through and your ${name} plan is back, with all its limits.` +
            (next ? ` Next payment: ${fmtDate(new Date(next))}.` : ''),
        );
      }
    } else if (remote.status === 'CANCELLED') {
      await this.markCancelled(sub.userId, sub);
    } else if (remote.status === 'SUSPENDED' || remote.status === 'EXPIRED') {
      await this.setStatus(sub.userId, remote.status);
    }
  }

  /**
   * Records charges PayPal made on a subscription that no webhook told us
   * about (PayPal gives up on a webhook after a few days). No receipt goes
   * out for these; they show in the payment list with their invoices.
   */
  private async syncPayments(
    userId: string,
    remote: PaypalSubscription,
    interval: string,
  ): Promise<number> {
    const end = new Date();
    const start = new Date(end.getTime() - 400 * DAY_MS);
    const list = await this.paypal.listTransactions(remote.id, start, end);
    let added = 0;
    for (const t of list) {
      // Partly refunded ones are left out: the refunded part is unknown here.
      if (t.status !== 'COMPLETED' && t.status !== 'REFUNDED') continue;
      const gross = t.amount_with_breakdown?.gross_amount;
      const at = t.time ? new Date(t.time) : new Date();
      const until = new Date(at);
      if (interval === 'year') until.setUTCFullYear(until.getUTCFullYear() + 1);
      else until.setUTCMonth(until.getUTCMonth() + 1);
      const row = await this.recordPayment(
        userId,
        {
          id: t.id,
          amount: { total: gross?.value, currency: gross?.currency_code },
          transaction_fee: {
            value: t.amount_with_breakdown?.fee_amount?.value,
          },
          create_time: t.time,
        },
        remote.id,
        remote.plan_id,
        until.toISOString(),
      );
      if (!row || row === 'duplicate') continue;
      added++;
      if (t.status === 'REFUNDED') {
        await this.prisma.payment.update({
          where: { id: row.id },
          data: { status: 'REFUNDED', refundedCents: row.amountCents },
        });
      }
    }
    return added;
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
          { status: 'ACTIVE', paypalSubscriptionId: null },
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
        paypalSubscriptionId: { not: null },
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
      await this.notify(
        sub.userId,
        'Your yearly plan renews soon',
        `Your ${plan?.name ?? sub.plan} plan renews on ${fmtDate(when)}` +
          (plan
            ? ` for ${fmtUsd(plan.priceYearlyUsd)} through PayPal`
            : ' through PayPal') +
          '. Nothing to do if you want to keep it. To stop the renewal, cancel before that date from Billing.',
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
      'Welcome to My Social Items',
      `Your account is on the Free plan: ${free.widgets} widget, ${free.sources} domain, ` +
        `${free.reviews} reviews shown and ${fmtViews(free.views)} widget views a month. Upgrade any time from Billing.`,
    );
  }

  // ============================================================ super admin

  async adminSubscriptions() {
    const rows = await this.prisma.subscription.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
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
      mode: await this.paypal.mode(),
      subscriptions: rows.map((r) => ({
        ...r,
        viewsThisMonth: views.get(r.userId) ?? 0,
      })),
      events,
    };
  }

  /**
   * Put a user on a plan by hand - a comped account, a refund, a support fix.
   * If they had an active PayPal subscription for a different plan it is
   * cancelled first, so they are not billed for a plan they no longer have.
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
    if (
      sub.paypalSubscriptionId &&
      !BillingService.ended(sub) &&
      plan.key !== sub.plan
    ) {
      await this.paypal
        .cancelSubscription(sub.paypalSubscriptionId, 'Plan changed by support')
        .catch((err) =>
          this.log.warn(`Could not cancel PayPal subscription: ${err}`),
        );
    }
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: plan.key,
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        paypalSubscriptionId:
          plan.key === sub.plan ? sub.paypalSubscriptionId : null,
        currentPeriodEnd: endsAt,
      },
    });
    if (plan.key !== sub.plan || sub.status !== 'ACTIVE') {
      await this.notify(
        userId,
        `Your plan is now ${plan.name}`,
        `Our team has moved your account to the ${plan.name} plan` +
          (endsAt ? `, until ${fmtDate(endsAt)}` : '') +
          (sub.paypalSubscriptionId && plan.key !== sub.plan
            ? '. Your previous PayPal subscription is cancelled, so you will not be charged for it again.'
            : '.'),
      );
    }
    return updated;
  }

  async adminCancel(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (sub.paypalSubscriptionId && !BillingService.ended(sub)) {
      await this.paypal.cancelSubscription(
        sub.paypalSubscriptionId,
        'Cancelled by support',
      );
    }
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: FREE_KEY,
        status: 'ACTIVE',
        paypalSubscriptionId: null,
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

  /** Pull the truth from PayPal when a webhook was missed. */
  async adminRefresh(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.paypalSubscriptionId)
      throw new BadRequestException('No PayPal subscription on this account.');
    const remote = await this.paypal.getSubscription(sub.paypalSubscriptionId);
    const owed = Number(remote.billing_info?.outstanding_balance?.value ?? 0);
    const status =
      remote.status === 'ACTIVE' || remote.status === 'APPROVED'
        ? // Still owing: an overdue account stays overdue.
          owed > 0 && sub.status === 'PAST_DUE'
          ? 'PAST_DUE'
          : 'ACTIVE'
        : remote.status;
    const matched = await this.plans.byPaypalId(remote.plan_id);
    await this.syncPayments(userId, remote, sub.interval).catch(
      (err: unknown) =>
        this.log.warn(`Payment sync failed for ${userId}: ${String(err)}`),
    );
    return this.prisma.subscription.update({
      where: { userId },
      data: {
        status,
        plan: matched?.key ?? sub.plan,
        currentPeriodEnd: remote.billing_info?.next_billing_time
          ? new Date(remote.billing_info.next_billing_time)
          : sub.currentPeriodEnd,
      },
    });
  }

  // ---- payments

  /** Every payment in one PayPal mode, with totals for the top of the page. */
  async adminPayments(modeRaw?: string) {
    const mode: PaypalMode =
      modeRaw === 'live' || modeRaw === 'sandbox'
        ? modeRaw
        : await this.paypal.mode();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const sums = {
      amountCents: true,
      refundedCents: true,
      feeCents: true,
    } as const;
    const [rows, all, month] = await Promise.all([
      this.prisma.payment.findMany({
        where: { mode },
        orderBy: { paidAt: 'desc' },
        take: 500,
      }),
      this.prisma.payment.aggregate({
        where: { mode },
        _sum: sums,
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { mode, paidAt: { gte: monthStart } },
        _sum: sums,
      }),
    ]);
    const net = (s: {
      amountCents: number | null;
      refundedCents: number | null;
    }) => (s.amountCents ?? 0) - (s.refundedCents ?? 0);
    return {
      mode,
      totals: {
        thisMonthCents: net(month._sum),
        allTimeCents: net(all._sum),
        refundedCents: all._sum.refundedCents ?? 0,
        feesCents: all._sum.feeCents ?? 0,
        count: all._count,
      },
      payments: rows.map((p) => ({ ...p, number: invoiceNumber(p.number) })),
    };
  }

  /** Refund all that is left of a payment, or `amount` dollars of it. */
  async adminRefund(paymentId: string, amountRaw?: unknown) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
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
    const refund = await this.paypal.refundSale(
      payment.mode === 'live' ? 'live' : 'sandbox',
      payment.paypalSaleId,
      // The whole payment: PayPal's plain refund, no amount needed.
      cents === payment.amountCents
        ? undefined
        : { total: (cents / 100).toFixed(2), currency: payment.currency },
    );
    await this.applyRefund(payment, refund.id, cents);
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
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
    return { mode: await this.paypal.mode(), plans: await this.plans.all() };
  }

  /**
   * Save a plan. If the price changed and the plan already exists on PayPal,
   * the new price is pushed there too - otherwise checkout would still charge
   * the old amount.
   */
  async adminSavePlan(input: PlanInput) {
    const before = await this.plans.get(input.key.toUpperCase());
    const saved = await this.plans.upsert(input);
    const warnings: string[] = [];

    const monthlyChanged = before && before.priceUsd !== saved.priceUsd;
    const yearlyChanged =
      before && before.priceYearlyUsd !== saved.priceYearlyUsd;
    const activeChanged =
      before && input.active !== undefined && before.active !== input.active;

    const liveMode = await this.paypal.mode();
    const repriced: boolean[] = [];
    for (const mode of ['sandbox', 'live'] as const) {
      if (!(await this.paypal.configured(mode))) continue;
      const ids: [string | null, number, boolean | undefined, boolean][] = [
        [
          mode === 'live' ? saved.paypalPlanIdLive : saved.paypalPlanIdSandbox,
          saved.priceUsd,
          monthlyChanged,
          false,
        ],
        [
          mode === 'live'
            ? saved.paypalYearlyIdLive
            : saved.paypalYearlyIdSandbox,
          saved.priceYearlyUsd,
          yearlyChanged,
          true,
        ],
      ];
      for (const [id, price, priceChanged, yearly] of ids) {
        if (!id) continue;
        try {
          if (priceChanged) {
            await this.paypal.updatePlanPrice(mode, id, price);
            if (mode === liveMode) repriced.push(yearly);
          }
          // Yearly plans made before this rule paused only after two missed
          // years; every save puts them on one.
          if (yearly) await this.paypal.setFailureThreshold(mode, id, 1);
          if (activeChanged)
            await this.paypal.setPlanActive(mode, id, saved.active);
        } catch (err) {
          warnings.push(`${mode}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    const notified = before
      ? await this.announcePrice(before, saved, repriced)
      : 0;
    return { plan: saved, warnings, notified };
  }

  /** Tells each paying subscriber of a plan about its new price, before they pay it. */
  private async announcePrice(before: Plan, saved: Plan, repriced: boolean[]) {
    let sent = 0;
    for (const yearly of repriced) {
      const from = yearly ? before.priceYearlyUsd : before.priceUsd;
      const to = yearly ? saved.priceYearlyUsd : saved.priceUsd;
      const subs = await this.prisma.subscription.findMany({
        where: {
          plan: saved.key,
          interval: yearly ? 'year' : 'month',
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          cancelAtPeriodEnd: false,
          paypalSubscriptionId: { not: null },
        },
      });
      for (const s of subs) {
        await this.notify(
          s.userId,
          `A price change for your ${saved.name} plan`,
          `The ${yearly ? 'yearly' : 'monthly'} price of ${saved.name} changes from ${fmtUsd(from)} to ${fmtUsd(to)}. ` +
            `It applies from your next payment${s.currentPeriodEnd && s.currentPeriodEnd > new Date() ? ` on ${fmtDate(s.currentPeriodEnd)}` : ''}. ` +
            'If you would rather not continue at the new price, you can cancel any time before then from Billing.',
        );
        sent++;
      }
    }
    return sent;
  }

  /** Create this plan on PayPal (current or given mode, monthly or yearly) and remember its id. */
  async adminCreateOnPaypal(
    key: string,
    mode?: PaypalMode,
    interval: BillingInterval = 'month',
  ) {
    const plan = await this.plans.get(key);
    if (!plan) throw new NotFoundException('Unknown plan.');
    if (plan.key === FREE_KEY || plan.priceUsd <= 0) {
      throw new BadRequestException('Free plans do not go to PayPal.');
    }
    const m = mode ?? (await this.paypal.mode());
    const existing = await this.paypalPlanId(plan, m, interval);
    if (existing)
      throw new BadRequestException(`Already on PayPal ${m}: ${existing}`);

    const yearly = interval === 'year';
    const id = await this.paypal.createPlan(
      m,
      `My Social Items ${plan.name}${yearly ? ' (yearly)' : ''}`,
      yearly ? plan.priceYearlyUsd : plan.priceUsd,
      yearly ? 'YEAR' : 'MONTH',
    );
    const field = yearly
      ? m === 'live'
        ? 'paypalYearlyIdLive'
        : 'paypalYearlyIdSandbox'
      : m === 'live'
        ? 'paypalPlanIdLive'
        : 'paypalPlanIdSandbox';
    return this.plans.upsert({ key: plan.key, [field]: id });
  }

  // ---- PayPal keys

  private static readonly PAYPAL_KEYS = [
    'SANDBOX_CLIENT_ID',
    'SANDBOX_CLIENT_SECRET',
    'SANDBOX_WEBHOOK_ID',
    'SANDBOX_PRODUCT_ID',
    'LIVE_CLIENT_ID',
    'LIVE_CLIENT_SECRET',
    'LIVE_WEBHOOK_ID',
    'LIVE_PRODUCT_ID',
  ];

  async adminPaypalSettings() {
    const keys: Record<
      string,
      { value: string; set: boolean; secret: boolean }
    > = {};
    for (const k of BillingService.PAYPAL_KEYS) {
      const value = await this.settings.get(`PAYPAL_${k}`);
      const secret = k.endsWith('SECRET');
      keys[k] = {
        value: secret ? SettingsService.mask(value) : (value ?? ''),
        set: Boolean(value),
        secret,
      };
    }
    const api = (this.config.get<string>('PUBLIC_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    return {
      mode: await this.paypal.mode(),
      keys,
      webhookUrl: `${api || '<your-api-url>'}/billing/webhook`,
      webhookEvents: [
        'BILLING.SUBSCRIPTION.ACTIVATED',
        'BILLING.SUBSCRIPTION.RE-ACTIVATED',
        'BILLING.SUBSCRIPTION.CANCELLED',
        'BILLING.SUBSCRIPTION.SUSPENDED',
        'BILLING.SUBSCRIPTION.EXPIRED',
        'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
        'PAYMENT.SALE.COMPLETED',
        'PAYMENT.SALE.REFUNDED',
        'PAYMENT.SALE.REVERSED',
      ],
      configured: {
        sandbox: await this.paypal.configured('sandbox'),
        live: await this.paypal.configured('live'),
      },
    };
  }

  async adminSavePaypal(input: Record<string, string>) {
    if (input.MODE !== undefined) {
      if (input.MODE !== 'sandbox' && input.MODE !== 'live') {
        throw new BadRequestException('Mode must be sandbox or live.');
      }
      if (
        input.MODE === 'live' &&
        !(await this.paypal.configured('live')) &&
        !(input.LIVE_CLIENT_ID && input.LIVE_CLIENT_SECRET)
      ) {
        throw new BadRequestException(
          'Add the live client id and secret before switching to live.',
        );
      }
    }
    for (const k of BillingService.PAYPAL_KEYS) {
      const value = input[k];
      // A blank secret field means "unchanged" - the UI never has the real value.
      if (typeof value !== 'string' || (k.endsWith('SECRET') && value === ''))
        continue;
      await this.settings.set(
        `PAYPAL_${k}`,
        String(value).trim(),
        k.endsWith('SECRET'),
      );
    }
    if (input.MODE) await this.settings.set('PAYPAL_MODE', input.MODE);
    this.paypal.resetTokens();
    return this.adminPaypalSettings();
  }

  adminTestPaypal(mode: PaypalMode) {
    return this.paypal.test(mode);
  }
}
