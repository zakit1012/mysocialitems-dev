import { BillingService } from './billing.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * Customers in India pay for a plan's rupee product, so they pay, and are
 * invoiced, in rupees; everyone else pays for its dollar product. The
 * account shows the currency the customer is actually charged in.
 */

const FREE = { key: 'FREE', name: 'Free', active: true, priceUsd: 0 };
const PRO = {
  key: 'PRO',
  name: 'Pro',
  active: true,
  priceUsd: 5,
  priceYearlyUsd: 50,
  priceInr: 350,
  priceYearlyInr: 3500,
  views: 1000,
  dodoMonthlyIdTest: 'prod_test_pro',
  dodoMonthlyIdLive: 'prod_live_pro',
  dodoYearlyIdTest: null,
  dodoYearlyIdLive: null,
  dodoMonthlyInrIdTest: 'prod_test_pro_inr',
  dodoMonthlyInrIdLive: 'prod_live_pro_inr',
  dodoYearlyInrIdTest: null,
  dodoYearlyInrIdLive: null,
};

type Row = Record<string, unknown>;

function setup(
  opts: {
    sub?: Row;
    payments?: Row[];
    remote?: Row;
    dodoPayments?: Row[];
    /** Changes to the Pro plan. */
    pro?: Row;
    /** The currency of the product the subscription is on now. */
    onCurrency?: 'USD' | 'INR';
  } = {},
) {
  const pro: Row = { ...PRO, ...opts.pro };
  const user = {
    id: 'u1',
    email: 'buyer@example.test',
    name: 'Buyer',
    role: 'USER',
    testPayments: false,
  };
  const sub: Row = {
    id: 's1',
    userId: 'u1',
    plan: 'FREE',
    status: 'ACTIVE',
    dodoSubscriptionId: null,
    dodoCustomerId: null,
    dodoMode: 'live',
    currency: null,
    pendingPlan: 'PRO',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: 'month',
    ...opts.sub,
  };
  const payments = opts.payments ?? [];
  const newest = (id: unknown) =>
    payments
      .filter((p) => p.dodoSubscriptionId === id)
      .sort((a, b) => Number(b.paidAt) - Number(a.paidAt))[0] ?? null;
  const prisma = {
    user: { findUnique: jest.fn(() => Promise.resolve(user)) },
    subscription: {
      findUnique: jest.fn(() => Promise.resolve(sub)),
      findMany: jest.fn(({ where }: { where: { id?: unknown } }) =>
        Promise.resolve(where.id ? [] : [sub]),
      ),
      update: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve(Object.assign(sub, data)),
      ),
    },
    payment: {
      findFirst: jest.fn(
        ({ where }: { where: { dodoSubscriptionId: unknown } }) =>
          Promise.resolve(newest(where.dodoSubscriptionId)),
      ),
      findMany: jest.fn(
        ({ where }: { where: { dodoSubscriptionId: { in: unknown[] } } }) =>
          Promise.resolve(
            where.dodoSubscriptionId.in.map(newest).filter(Boolean),
          ),
      ),
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: `p${payments.length + 1}`, ...data };
        payments.push(row);
        return Promise.resolve(row);
      }),
    },
    billingEvent: {
      create: jest.fn(() => Promise.resolve({})),
      delete: jest.fn(() => Promise.resolve({})),
    },
    widget: { count: jest.fn(() => Promise.resolve(0)) },
    source: { count: jest.fn(() => Promise.resolve(0)) },
    usage: { findUnique: jest.fn(() => Promise.resolve(null)) },
  };
  const plans = {
    get: jest.fn((key: string) =>
      Promise.resolve(key === 'PRO' ? { ...pro } : FREE),
    ),
    byDodoProduct: jest.fn(() =>
      Promise.resolve({
        plan: { ...pro },
        yearly: false,
        currency: opts.onCurrency ?? 'USD',
      }),
    ),
    free: jest.fn(() => Promise.resolve(FREE)),
    all: jest.fn(() => Promise.resolve([FREE, { ...pro }])),
    upsert: jest.fn((input: Row) => {
      const fields = { ...input };
      delete fields.key;
      Object.assign(pro, fields);
      return Promise.resolve({ ...pro });
    }),
  };
  const dodo = {
    mode: jest.fn(() => Promise.resolve('live')),
    configured: jest.fn(() => Promise.resolve(true)),
    createCheckout: jest.fn(() =>
      Promise.resolve({ session_id: 'cs_1', checkout_url: 'https://pay' }),
    ),
    getSubscription: jest.fn((id: string) =>
      Promise.resolve({
        subscription_id: id,
        status: 'active',
        product_id: 'prod_live_pro',
        customer: { customer_id: 'cus_1', email: user.email },
        currency: 'USD',
        next_billing_date: '2026-10-28T00:00:00Z',
        payment_frequency_interval: 'Month',
        metadata: { user_id: 'u1' },
        ...opts.remote,
      }),
    ),
    subscriptionPayments: jest.fn(() =>
      Promise.resolve(opts.dodoPayments ?? []),
    ),
    createProduct: jest.fn(
      () => new Promise((done) => setTimeout(() => done('prod_new_inr'), 5)),
    ),
    updateProductPrice: jest.fn(() => Promise.resolve()),
    setRupeePrice: jest.fn(() => Promise.resolve()),
    changePlan: jest.fn(() => Promise.resolve({})),
    updateSubscription: jest.fn(() => Promise.resolve({})),
  };
  const mail = { send: jest.fn(() => Promise.resolve()) };
  const config = { get: jest.fn(() => undefined) };
  const service = new BillingService(
    prisma as never,
    mail as never,
    dodo as never,
    plans as never,
    {} as never,
    config as never,
  );
  return { service, dodo, prisma, plans, sub, pro };
}

/** What the checkout was opened with. */
const checkoutOf = (dodo: ReturnType<typeof setup>['dodo']) =>
  dodo.createCheckout.mock.calls[0] as unknown as [
    { india: boolean; productId: string; metadata: Record<string, string> },
  ];

/** The products made on Dodo. */
const madeOf = (dodo: ReturnType<typeof setup>['dodo']) =>
  dodo.createProduct.mock.calls as unknown as [
    string,
    { priceCents: number; interval: string; currency?: string },
  ][];

describe('customers in India pay for rupee products', () => {
  it('sends a checkout from India to the rupee product', async () => {
    const { service, dodo } = setup({ sub: { pendingPlan: null } });
    await service.startCheckout('u1', 'PRO', 'month', 'IN');
    const [input] = checkoutOf(dodo);
    expect(input.productId).toBe('prod_live_pro_inr');
    expect(input.india).toBe(true);
    expect(dodo.createProduct).not.toHaveBeenCalled();
  });

  it('sends everyone else to the dollar product', async () => {
    const { service, dodo } = setup({ sub: { pendingPlan: null } });
    await service.startCheckout('u1', 'PRO', 'month');
    const [input] = checkoutOf(dodo);
    expect(input.productId).toBe('prod_live_pro');
    expect(input.india).toBe(false);
  });

  it('makes the rupee product on Dodo the first time it is needed', async () => {
    const { service, dodo, plans } = setup({
      sub: { pendingPlan: null },
      pro: { dodoMonthlyInrIdLive: null },
    });
    await service.startCheckout('u1', 'PRO', 'month', 'IN');
    expect(madeOf(dodo)).toEqual([
      [
        'live',
        expect.objectContaining({
          priceCents: 35000,
          interval: 'Month',
          currency: 'INR',
        }),
      ],
    ]);
    expect(plans.upsert).toHaveBeenCalledWith({
      key: 'PRO',
      dodoMonthlyInrIdLive: 'prod_new_inr',
    });
    expect(checkoutOf(dodo)[0].productId).toBe('prod_new_inr');
  });

  it('makes one rupee product for two checkouts at once', async () => {
    const { service, dodo } = setup({
      sub: { pendingPlan: null },
      pro: { dodoMonthlyInrIdLive: null },
    });
    await Promise.all([
      service.startCheckout('u1', 'PRO', 'month', 'IN'),
      service.startCheckout('u1', 'PRO', 'month', 'IN'),
    ]);
    expect(dodo.createProduct).toHaveBeenCalledTimes(1);
  });

  it('moves a rupee subscription to the rupee product of its new plan', async () => {
    const { service, dodo } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', pendingPlan: null },
      onCurrency: 'INR',
      pro: { dodoYearlyIdLive: 'prod_live_pro_year' },
    });
    await service.startCheckout('u1', 'PRO', 'year');
    expect(madeOf(dodo)[0][1]).toEqual(
      expect.objectContaining({ priceCents: 350000, currency: 'INR' }),
    );
    expect(dodo.changePlan).toHaveBeenCalledWith(
      'sub_1',
      'prod_new_inr',
      expect.any(Boolean),
      'live',
    );
  });

  it('keeps a dollar subscription on dollar products', async () => {
    const { service, dodo } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', pendingPlan: null },
      onCurrency: 'USD',
      pro: { dodoYearlyIdLive: 'prod_live_pro_year' },
    });
    await service.startCheckout('u1', 'PRO', 'year');
    expect(dodo.changePlan).toHaveBeenCalledWith(
      'sub_1',
      'prod_live_pro_year',
      expect.any(Boolean),
      'live',
    );
    expect(dodo.createProduct).not.toHaveBeenCalled();
  });

  it('makes the missing rupee products when a plan is saved', async () => {
    const { service, dodo } = setup({
      pro: { dodoMonthlyInrIdTest: null, dodoMonthlyInrIdLive: null },
    });
    await service.adminSavePlan({ key: 'PRO' });
    // Monthly in both modes; there is no yearly dollar product to follow.
    expect(madeOf(dodo).map(([mode, p]) => [mode, p.currency])).toEqual([
      ['test', 'INR'],
      ['live', 'INR'],
    ]);
  });
});

describe('the currency an account is billed in', () => {
  it('remembers that a checkout from India was opened in rupees', async () => {
    const { service, dodo } = setup({ sub: { pendingPlan: null } });
    await service.startCheckout('u1', 'PRO', 'month', 'IN');
    expect(checkoutOf(dodo)[0].metadata.currency).toBe('INR');
  });

  it('remembers that a checkout elsewhere was opened in dollars', async () => {
    const { service, dodo } = setup({ sub: { pendingPlan: null } });
    await service.startCheckout('u1', 'PRO', 'month');
    expect(checkoutOf(dodo)[0].metadata.currency).toBe('USD');
  });

  it('shows rupees on return from a rupee checkout, though Dodo says USD', async () => {
    const { service, sub } = setup({
      remote: { metadata: { user_id: 'u1', currency: 'INR' } },
    });
    await service.confirm('u1', 'sub_1');
    expect(sub.plan).toBe('PRO');
    expect(sub.currency).toBe('INR');
  });

  it('goes by the charge once there is one', async () => {
    const { service, sub } = setup({
      // Opened in rupees, but the customer switched to dollars at checkout.
      remote: { metadata: { user_id: 'u1', currency: 'INR' } },
      payments: [
        { dodoSubscriptionId: 'sub_1', currency: 'USD', paidAt: new Date(1) },
      ],
    });
    await service.confirm('u1', 'sub_1');
    expect(sub.currency).toBe('USD');
  });

  it('keeps rupees on a later update of a subscription paid in rupees', async () => {
    const { service, sub } = setup({
      sub: {
        plan: 'PRO',
        dodoSubscriptionId: 'sub_1',
        currency: 'USD',
        pendingPlan: null,
      },
      payments: [
        { dodoSubscriptionId: 'sub_1', currency: 'INR', paidAt: new Date(1) },
      ],
    });
    await service.confirm('u1', 'sub_1');
    expect(sub.currency).toBe('INR');
  });

  it('puts right an account saved in dollars that pays in rupees', async () => {
    const { service, sub, prisma } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', currency: 'USD' },
      payments: [
        { dodoSubscriptionId: 'sub_1', currency: 'USD', paidAt: new Date(1) },
        { dodoSubscriptionId: 'sub_1', currency: 'INR', paidAt: new Date(2) },
      ],
    });
    expect(await service.settleCurrencies()).toBe(1);
    expect(sub.currency).toBe('INR');
    // Already right: nothing to write.
    prisma.subscription.update.mockClear();
    expect(await service.settleCurrencies()).toBe(0);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('shows the charged currency as soon as the billing page opens', async () => {
    const { service, sub } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', currency: 'USD' },
      payments: [
        { dodoSubscriptionId: 'sub_1', currency: 'INR', paidAt: new Date(1) },
      ],
    });
    const page = await service.overview('u1');
    expect(page.subscription.currency).toBe('INR');
    expect(sub.currency).toBe('INR');
  });

  it("reads Dodo's charges when no webhook recorded any", async () => {
    const { service, sub, prisma } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', currency: 'USD' },
      dodoPayments: [
        {
          payment_id: 'pay_1',
          subscription_id: 'sub_1',
          status: 'succeeded',
          total_amount: 29900,
          currency: 'INR',
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ],
    });
    const page = await service.overview('u1');
    expect(page.subscription.currency).toBe('INR');
    expect(sub.currency).toBe('INR');
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });

  it('leaves a charge made moments ago to its webhook, which sends the receipt', async () => {
    const { service, prisma } = setup({
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_1', currency: 'INR' },
      dodoPayments: [
        {
          payment_id: 'pay_1',
          subscription_id: 'sub_1',
          status: 'succeeded',
          total_amount: 29900,
          currency: 'INR',
          created_at: new Date().toISOString(),
        },
      ],
    });
    const page = await service.overview('u1');
    expect(page.subscription.currency).toBe('INR');
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
