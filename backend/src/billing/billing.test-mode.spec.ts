import { BillingService } from './billing.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * Developer accounts (User.testPayments) check out in Dodo's test mode while
 * everyone else follows the site-wide switch, and a subscription is always
 * handled in the mode it was created in.
 */

const FREE = { key: 'FREE', name: 'Free', active: true, priceUsd: 0 };
const PRO = {
  key: 'PRO',
  name: 'Pro',
  active: true,
  priceUsd: 5,
  priceYearlyUsd: 50,
  dodoMonthlyIdTest: 'prod_test_pro',
  dodoMonthlyIdLive: 'prod_live_pro',
  dodoYearlyIdTest: null,
  dodoYearlyIdLive: null,
};

function setup(opts: {
  siteMode: 'test' | 'live';
  developer: boolean;
  sub?: Record<string, unknown>;
}) {
  const user = {
    id: 'u1',
    email: 'dev@example.test',
    name: 'Dev',
    role: 'USER',
    testPayments: opts.developer,
  };
  const sub: Record<string, unknown> = {
    id: 's1',
    userId: 'u1',
    plan: 'FREE',
    status: 'ACTIVE',
    dodoSubscriptionId: null,
    dodoCustomerId: null,
    dodoMode: null,
    currency: null,
    pendingPlan: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: 'month',
    ...opts.sub,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(() => Promise.resolve(user)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...user, ...data }),
      ),
    },
    subscription: {
      findUnique: jest.fn(() => Promise.resolve(sub)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(Object.assign(sub, data)),
      ),
    },
    widget: { count: jest.fn(() => Promise.resolve(0)) },
    source: { count: jest.fn(() => Promise.resolve(0)) },
    usage: { findUnique: jest.fn(() => Promise.resolve(null)) },
  };
  const plans = {
    get: jest.fn((key: string) => Promise.resolve(key === 'PRO' ? PRO : FREE)),
    all: jest.fn(() => Promise.resolve([FREE, PRO])),
    free: jest.fn(() => Promise.resolve(FREE)),
  };
  const dodo = {
    mode: jest.fn(() => Promise.resolve(opts.siteMode)),
    configured: jest.fn(() => Promise.resolve(true)),
    createCheckout: jest.fn(() =>
      Promise.resolve({ session_id: 'cs_1', checkout_url: 'https://pay' }),
    ),
    updateSubscription: jest.fn(() => Promise.resolve({})),
    // "pending": sync() leaves the account alone, which is all these need.
    getSubscription: jest.fn((id: string) =>
      Promise.resolve({ subscription_id: id, status: 'pending' }),
    ),
    changePlan: jest.fn(() => Promise.resolve({})),
  };
  const config = { get: jest.fn(() => undefined) };
  const service = new BillingService(
    prisma as never,
    {} as never,
    dodo as never,
    plans as never,
    {} as never,
    config as never,
  );
  return { service, dodo, prisma, sub };
}

describe('developer accounts pay in Dodo test mode', () => {
  it('sends a developer to a test checkout on a live site', async () => {
    const { service, dodo } = setup({ siteMode: 'live', developer: true });
    await service.startCheckout('u1', 'PRO', 'month');
    expect(dodo.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'test', productId: 'prod_test_pro' }),
    );
  });

  it('sends everyone else to a live checkout on a live site', async () => {
    const { service, dodo } = setup({ siteMode: 'live', developer: false });
    await service.startCheckout('u1', 'PRO', 'month');
    expect(dodo.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'live', productId: 'prod_live_pro' }),
    );
  });

  it('shows the billing page in test mode to a developer only', async () => {
    const dev = setup({ siteMode: 'live', developer: true });
    const normal = setup({ siteMode: 'live', developer: false });
    expect((await dev.service.overview('u1')).testMode).toBe(true);
    expect(dev.dodo.configured).toHaveBeenCalledWith('test');
    expect((await normal.service.overview('u1')).testMode).toBe(false);
    expect(normal.dodo.configured).toHaveBeenCalledWith('live');
  });

  it('cancels a subscription in the mode it was created in', async () => {
    const { service, dodo } = setup({
      siteMode: 'live',
      developer: false,
      sub: {
        plan: 'PRO',
        dodoSubscriptionId: 'sub_test_1',
        dodoMode: 'test',
      },
    });
    await service.cancel('u1');
    expect(dodo.updateSubscription).toHaveBeenCalledWith(
      'sub_test_1',
      expect.any(Object),
      'test',
    );
    expect(dodo.getSubscription).toHaveBeenCalledWith('sub_test_1', 'test');
  });

  it('treats older subscriptions without a stored mode as the site-wide mode', async () => {
    const { service, dodo } = setup({
      siteMode: 'live',
      developer: true,
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_old', dodoMode: null },
    });
    await service.cancel('u1');
    expect(dodo.updateSubscription).toHaveBeenCalledWith(
      'sub_old',
      expect.any(Object),
      'live',
    );
  });

  it('refuses to switch an account with a running subscription', async () => {
    const { service, prisma } = setup({
      siteMode: 'live',
      developer: true,
      sub: { plan: 'PRO', dodoSubscriptionId: 'sub_test_1', dodoMode: 'test' },
    });
    await expect(service.adminSetTestPayments('u1', false)).rejects.toThrow(
      /test subscription that is not over/,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('switches an account with no running subscription', async () => {
    const { service, prisma } = setup({ siteMode: 'live', developer: false });
    const user = await service.adminSetTestPayments('u1', true);
    expect(user.testPayments).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('only takes true or false', async () => {
    const { service } = setup({ siteMode: 'live', developer: false });
    await expect(service.adminSetTestPayments('u1', 'yes')).rejects.toThrow(
      /true or false/,
    );
  });
});
