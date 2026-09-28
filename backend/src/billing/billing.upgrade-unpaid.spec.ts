import { BillingService } from './billing.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * An upgrade starts at once and its difference is charged alongside. If
 * that charge fails, the account has the plan it had paid for until a
 * payment goes through - never less, and never more for free.
 */

type Row = Record<string, unknown>;

const FREE = { key: 'FREE', name: 'Free', active: true, priceUsd: 0 };
const PRO = {
  key: 'PRO',
  name: 'Pro',
  active: true,
  priceUsd: 5,
  priceYearlyUsd: 50,
  dodoMonthlyIdLive: 'prod_pro',
  dodoYearlyIdLive: 'prod_pro_year',
};
const BUSINESS = {
  key: 'BUSINESS',
  name: 'Business',
  active: true,
  priceUsd: 10,
  priceYearlyUsd: 100,
  dodoMonthlyIdLive: 'prod_biz',
};
const PLANS: Record<string, Row> = { FREE, PRO, BUSINESS };
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function setup(sub: Row = {}) {
  const row: Row = {
    id: 's1',
    userId: 'u1',
    plan: 'PRO',
    status: 'ACTIVE',
    interval: 'month',
    dodoSubscriptionId: 'sub_1',
    dodoCustomerId: 'cus_1',
    dodoMode: 'live',
    currency: 'USD',
    pendingPlan: null,
    currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    cancelAtPeriodEnd: false,
    upgradeFrom: null,
    upgradeAt: null,
    upgradeUnpaid: false,
    scheduledPlan: null,
    scheduledInterval: null,
    ...sub,
  };
  // Dodo's side: the product the subscription is on, a change waiting for
  // the next billing date, and the subscription's status.
  let product = row.plan === 'BUSINESS' ? 'prod_biz' : 'prod_pro';
  let scheduled: string | null = null;
  let status = 'active';
  const payments: Row[] = [];
  const events = new Set<string>();
  const prisma = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'u1',
          email: 'c@example.test',
          name: 'C',
          role: 'USER',
        }),
      ),
    },
    subscription: {
      findUnique: jest.fn(() => Promise.resolve({ ...row })),
      findFirst: jest.fn(() => Promise.resolve({ userId: 'u1' })),
      update: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve(Object.assign(row, data)),
      ),
    },
    billingEvent: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(events.has(where.id) ? {} : null),
      ),
      create: jest.fn(({ data }: { data: { id: string } }) => {
        if (events.has(data.id)) return Promise.reject(new Error('dup'));
        events.add(data.id);
        return Promise.resolve({});
      }),
      delete: jest.fn(() => Promise.resolve({})),
    },
    widget: { count: jest.fn(() => Promise.resolve(0)) },
    source: { count: jest.fn(() => Promise.resolve(0)) },
    usage: { findUnique: jest.fn(() => Promise.resolve(null)) },
    payment: {
      create: jest.fn(({ data }: { data: Row }) => {
        const p = {
          id: `p${payments.length + 1}`,
          number: payments.length + 1,
          ...data,
        };
        payments.push(p);
        return Promise.resolve(p);
      }),
      count: jest.fn(() => Promise.resolve(payments.length)),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
  };
  const plans = {
    get: jest.fn((key: string) => Promise.resolve(PLANS[key])),
    free: jest.fn(() => Promise.resolve(FREE)),
    all: jest.fn(() => Promise.resolve([FREE, PRO, BUSINESS])),
    byDodoProduct: jest.fn((id: string) =>
      Promise.resolve({
        plan: id === 'prod_biz' ? BUSINESS : PRO,
        yearly: id === 'prod_pro_year',
      }),
    ),
  };
  const dodo = {
    mode: jest.fn(() => Promise.resolve('live')),
    configured: jest.fn(() => Promise.resolve(true)),
    verifyWebhook: jest.fn(() => Promise.resolve('live')),
    changePlan: jest.fn((_id: string, productId: string, upgrade: boolean) => {
      if (scheduled) {
        return Promise.reject(
          new Error(
            'Payment service 400: A pending plan change already exists for this subscription (PendingPlanChangeExists).',
          ),
        );
      }
      if (upgrade) product = productId;
      else scheduled = productId;
      return Promise.resolve({});
    }),
    cancelScheduledChange: jest.fn(() => {
      if (!scheduled) {
        return Promise.reject(new Error('Payment service 404: not found'));
      }
      scheduled = null;
      return Promise.resolve({});
    }),
    getSubscription: jest.fn((id: string) =>
      Promise.resolve({
        subscription_id: id,
        status,
        product_id: product,
        customer: { customer_id: 'cus_1' },
        next_billing_date: (row.currentPeriodEnd as Date).toISOString(),
        payment_frequency_interval: 'Month',
        metadata: { user_id: 'u1' },
      }),
    ),
    updateSubscription: jest.fn(() => Promise.resolve({})),
  };
  const mail = { send: jest.fn(() => Promise.resolve()) };
  const service = new BillingService(
    prisma as never,
    mail as never,
    dodo as never,
    plans as never,
    {} as never,
    { get: jest.fn(() => undefined) } as never,
  );
  let n = 0;
  /** Dodo sends a webhook. */
  const webhook = (type: string, data: Row) =>
    service.handleWebhook(
      { 'webhook-id': `evt_${++n}` },
      Buffer.from(
        JSON.stringify({
          type,
          data: { metadata: { user_id: 'u1' }, ...data },
        }),
      ),
    );
  const charge = (
    status: 'succeeded' | 'failed',
    createdMsAgo: number,
    sub = 'sub_1',
  ) =>
    webhook(`payment.${status}`, {
      payment_id: `pay_${n + 1}`,
      subscription_id: sub,
      status,
      total_amount: 500,
      currency: 'USD',
      created_at: iso(createdMsAgo),
    });
  const subjects = () =>
    (mail.send.mock.calls as unknown as [string, string][]).map((c) => c[1]);
  /** Dodo tells of a change to the subscription (renewal, hold). */
  const subscriptionNews = (
    type: string,
    next: { status?: string; product?: string },
  ) => {
    if (next.status) status = next.status;
    if (next.product) product = next.product;
    return webhook(type, {
      subscription_id: 'sub_1',
      status,
      product_id: product,
      customer: { customer_id: 'cus_1' },
      next_billing_date: (row.currentPeriodEnd as Date).toISOString(),
      payment_frequency_interval: 'Month',
    });
  };
  const scheduledOnDodo = () => scheduled;
  return {
    service,
    row,
    webhook,
    charge,
    subjects,
    dodo,
    subscriptionNews,
    scheduledOnDodo,
  };
}

const planOf = async (service: BillingService) =>
  (await service.planFor('u1')).key;

describe('an upgrade whose difference is not paid', () => {
  it('starts Business at once and remembers it came from Pro', async () => {
    const { service, row } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    expect(await planOf(service)).toBe('BUSINESS');
    expect(row.upgradeFrom).toBe('PRO');
  });

  it('goes back to Pro when the difference fails, and says so', async () => {
    const { service, charge, subjects } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('failed', 0);
    expect(await planOf(service)).toBe('PRO');
    expect(subjects()).toContain('The payment for Business did not go through');
    const page = await service.overview('u1');
    expect(page.subscription.upgradeUnpaid).toBe(true);
  });

  it('brings Business back once a payment goes through', async () => {
    const { service, charge, row, subjects } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('failed', 0);
    await charge('succeeded', 0);
    expect(await planOf(service)).toBe('BUSINESS');
    expect(row.upgradeFrom).toBeNull();
    expect(subjects().some((s) => s.startsWith('Payment received'))).toBe(true);
  });

  it('keeps Business when the difference is paid', async () => {
    const { service, charge, row } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('succeeded', 0);
    expect(await planOf(service)).toBe('BUSINESS');
    expect(row.upgradeFrom).toBeNull();
    // Settled: a later failure (a renewal) is the subscription's own business.
    await charge('failed', 0);
    expect(await planOf(service)).toBe('BUSINESS');
  });

  it('ignores a failed charge made before the upgrade', async () => {
    const { service, charge } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('failed', 60 * 60 * 1000);
    expect(await planOf(service)).toBe('BUSINESS');
  });

  it('ignores a late payment for Pro when deciding the upgrade is paid', async () => {
    const { service, charge, row } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('succeeded', 60 * 60 * 1000); // the Pro purchase, reported late
    expect(row.upgradeFrom).toBe('PRO');
    await charge('failed', 0);
    expect(await planOf(service)).toBe('PRO');
  });

  it('ignores a failed charge on another subscription', async () => {
    const { service, charge } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await charge('failed', 0, 'sub_old');
    expect(await planOf(service)).toBe('BUSINESS');
  });

  it('is not about a failure long after the upgrade', async () => {
    const { service, charge } = setup({
      plan: 'BUSINESS',
      upgradeFrom: 'PRO',
      upgradeAt: new Date(Date.now() - 8 * 86_400_000),
    });
    await charge('failed', 0);
    expect(await planOf(service)).toBe('BUSINESS');
  });

  it('does not wait on a downgrade', async () => {
    const { service, row } = setup({ plan: 'BUSINESS' });
    await service.startCheckout('u1', 'PRO', 'month');
    expect(row.upgradeFrom).toBeNull();
  });
});

describe('Dodo putting an unpaid upgrade on hold', () => {
  it('keeps the plan paid for, with one email about the upgrade', async () => {
    const { service, subscriptionNews, charge, subjects } = setup();
    await service.startCheckout('u1', 'BUSINESS', 'month');
    await subscriptionNews('subscription.on_hold', { status: 'on_hold' });
    expect(await planOf(service)).toBe('PRO');
    await charge('failed', 0);
    const about = subjects().filter((t) =>
      /did not go through|overdue/i.test(t),
    );
    expect(about).toEqual(['The payment for Business did not go through']);
  });

  it('still treats a missed renewal as overdue, on Free limits', async () => {
    const { service, subscriptionNews, subjects } = setup();
    await subscriptionNews('subscription.on_hold', { status: 'on_hold' });
    expect(await planOf(service)).toBe('FREE');
    expect(subjects()).toContain('Your payment is overdue');
  });
});

describe('a change waiting for the next billing date', () => {
  it('is remembered and shown', async () => {
    const { service, row } = setup({ plan: 'BUSINESS' });
    await service.startCheckout('u1', 'PRO', 'month');
    expect([row.scheduledPlan, row.scheduledInterval]).toEqual([
      'PRO',
      'month',
    ]);
    const page = await service.overview('u1');
    expect(page.subscription.scheduledPlan).toBe('PRO');
    expect(await planOf(service)).toBe('BUSINESS');
  });

  it('can be taken back by choosing the plan they are on', async () => {
    const { service, row, scheduledOnDodo } = setup({ plan: 'BUSINESS' });
    await service.startCheckout('u1', 'PRO', 'month');
    const r = await service.startCheckout('u1', 'BUSINESS', 'month');
    expect(r).toEqual({ done: 'kept' });
    expect(scheduledOnDodo()).toBeNull();
    expect(row.scheduledPlan).toBeNull();
  });

  it('says "already on" when nothing is waiting', async () => {
    const { service } = setup({ plan: 'BUSINESS' });
    await expect(
      service.startCheckout('u1', 'BUSINESS', 'month'),
    ).rejects.toThrow(/already on Business/);
  });

  it('is replaced by a new choice instead of blocking it', async () => {
    const { service, row, dodo } = setup({ plan: 'BUSINESS' });
    await service.startCheckout('u1', 'PRO', 'month');
    await service.startCheckout('u1', 'PRO', 'year');
    expect(dodo.cancelScheduledChange).toHaveBeenCalledTimes(1);
    expect([row.scheduledPlan, row.scheduledInterval]).toEqual(['PRO', 'year']);
  });

  it('is cleared once it applies', async () => {
    const { service, row, subscriptionNews } = setup({ plan: 'BUSINESS' });
    await service.startCheckout('u1', 'PRO', 'month');
    await subscriptionNews('subscription.renewed', { product: 'prod_pro' });
    expect(row.plan).toBe('PRO');
    expect(row.scheduledPlan).toBeNull();
  });
});
