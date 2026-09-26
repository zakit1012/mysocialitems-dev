import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { PaypalClient, PaypalMode } from './paypal.client';
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
};
type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: WebhookResource;
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
   * paid plan until the end of the period it was paid for.
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
      sub.status === 'ACTIVE' || (sub.status === 'CANCELLED' && paidThrough);
    const plan = live ? await this.plans.get(sub.plan) : undefined;
    return plan ?? (await this.plans.free());
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
      if (!usage.warned80 && usage.views >= plan.views * 0.8) {
        await this.flagAndMail(usage.id, 'warned80', userId, plan, 80);
      }
      if (!usage.warned100 && usage.views >= plan.views) {
        await this.flagAndMail(usage.id, 'warned100', userId, plan, 100);
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

    const created = await this.paypal.createSubscription({
      planId: paypalPlan,
      customId: userId,
      email: user.email,
      returnUrl: `${this.appUrl()}/dashboard/billing?paypal=return`,
      cancelUrl: `${this.appUrl()}/dashboard/billing?paypal=cancel`,
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
    await this.paypal.cancelSubscription(
      sub.paypalSubscriptionId,
      'Cancelled by the customer',
    );
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
    const userId = await this.userForSubscription(
      subscriptionId,
      resource.custom_id,
    );

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
        await this.setStatus(
          userId,
          'SUSPENDED',
          'Your subscription is paused',
          'PayPal has suspended your subscription, usually after a failed payment. Your widgets are back on Free limits until it is resolved.',
        );
        break;
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        if (aboutAnother) break;
        await this.setStatus(
          userId,
          'EXPIRED',
          'Your subscription has ended',
          'Your paid plan has ended and your account is back on Free.',
        );
        break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        if (aboutAnother) break;
        await this.notify(
          userId,
          'A payment did not go through',
          'PayPal could not collect your latest payment. Please update your payment method in PayPal to keep your plan.',
        );
        break;
      case 'PAYMENT.SALE.COMPLETED':
        if (aboutAnother) break;
        await this.paymentReceived(userId, resource, subscriptionId);
        break;
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

    // Switching plans creates a new PayPal subscription; stop billing the old one.
    if (
      before.paypalSubscriptionId &&
      before.paypalSubscriptionId !== paypalId
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
        currentPeriodEnd: nextBilling ? new Date(nextBilling) : null,
        // Only a matched PayPal id says which one it is; otherwise keep it.
        interval: matched
          ? BillingService.isYearlyId(matched, paypalPlan)
            ? 'year'
            : 'month'
          : before.interval,
      },
    });

    const alreadyActive =
      before.status === 'ACTIVE' &&
      before.plan === plan.key &&
      before.paypalSubscriptionId === paypalId;
    if (!alreadyActive) {
      await this.notify(
        userId,
        `Welcome to ${plan.name}`,
        `Your ${plan.name} plan is active: ${plan.widgets} widgets, ${plan.sources} domains, ` +
          `${plan.reviews} reviews per widget and ${fmtViews(plan.views)} views a month.`,
      );
    }
  }

  private async markCancelled(userId: string, sub: Subscription) {
    if (sub.status === 'CANCELLED') return;
    await this.prisma.subscription.update({
      where: { userId },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
    });
    const until =
      sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
        ? ` You keep ${sub.plan} features until ${sub.currentPeriodEnd.toDateString()}, then move to Free.`
        : ' Your account is now on the Free plan.';
    await this.notify(
      userId,
      'Your subscription is cancelled',
      `We have cancelled your subscription.${until}`,
    );
  }

  private async setStatus(
    userId: string,
    status: string,
    subject: string,
    line: string,
  ) {
    await this.prisma.subscription.update({
      where: { userId },
      data: { status },
    });
    await this.notify(userId, subject, line);
  }

  private async paymentReceived(
    userId: string,
    sale: WebhookResource,
    subscriptionId?: string,
  ) {
    if (subscriptionId) {
      // A successful charge also tells us the new end of the paid period.
      const remote = await this.paypal
        .getSubscription(subscriptionId)
        .catch(() => null);
      const next = remote?.billing_info?.next_billing_time;
      if (next) {
        await this.prisma.subscription.update({
          where: { userId },
          data: { currentPeriodEnd: new Date(next) },
        });
      }
    }
    const amount = sale.amount?.total
      ? `${sale.amount.total} ${sale.amount.currency ?? ''}`.trim()
      : 'your payment';
    await this.notify(
      userId,
      'Payment received',
      `Thanks - we received ${amount}. Your plan continues uninterrupted.`,
    );
  }

  private async notify(userId: string, subject: string, line: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    await this.mail.send(user.email, subject, [`Hi ${user.name},`, line], {
      label: 'Open billing',
      url: `${this.appUrl()}/dashboard/billing`,
    });
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
      sub.status === 'ACTIVE' &&
      plan.key !== sub.plan
    ) {
      await this.paypal
        .cancelSubscription(sub.paypalSubscriptionId, 'Plan changed by support')
        .catch((err) =>
          this.log.warn(`Could not cancel PayPal subscription: ${err}`),
        );
    }
    return this.prisma.subscription.update({
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
  }

  async adminCancel(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (sub.paypalSubscriptionId) {
      await this.paypal.cancelSubscription(
        sub.paypalSubscriptionId,
        'Cancelled by support',
      );
    }
    return this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: FREE_KEY,
        status: 'ACTIVE',
        paypalSubscriptionId: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    });
  }

  /** Pull the truth from PayPal when a webhook was missed. */
  async adminRefresh(userId: string) {
    const sub = await this.subscriptionFor(userId);
    if (!sub.paypalSubscriptionId)
      throw new BadRequestException('No PayPal subscription on this account.');
    const remote = await this.paypal.getSubscription(sub.paypalSubscriptionId);
    const status =
      remote.status === 'ACTIVE' || remote.status === 'APPROVED'
        ? 'ACTIVE'
        : remote.status;
    const matched = await this.plans.byPaypalId(remote.plan_id);
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

    for (const mode of ['sandbox', 'live'] as const) {
      if (!(await this.paypal.configured(mode))) continue;
      const ids: [string | null, number, boolean | undefined][] = [
        [
          mode === 'live' ? saved.paypalPlanIdLive : saved.paypalPlanIdSandbox,
          saved.priceUsd,
          monthlyChanged,
        ],
        [
          mode === 'live'
            ? saved.paypalYearlyIdLive
            : saved.paypalYearlyIdSandbox,
          saved.priceYearlyUsd,
          yearlyChanged,
        ],
      ];
      for (const [id, price, priceChanged] of ids) {
        if (!id) continue;
        try {
          if (priceChanged) await this.paypal.updatePlanPrice(mode, id, price);
          if (activeChanged)
            await this.paypal.setPlanActive(mode, id, saved.active);
        } catch (err) {
          warnings.push(`${mode}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    return { plan: saved, warnings };
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
