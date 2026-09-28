import { BillingService } from './billing.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * A refund from Admin -> Payments can also stop the subscription, in one
 * step: the refund goes first, then the cancel - and only the customer's
 * current subscription is cancelled.
 */

type Row = Record<string, unknown>;

function setup(opts: { sub?: Row; payment?: Row; cancelFails?: boolean } = {}) {
  const payment: Row = {
    id: 'p1',
    number: 1,
    userId: 'u1',
    dodoPaymentId: 'pay_1',
    dodoSubscriptionId: 'sub_1',
    mode: 'live',
    amountCents: 500,
    refundedCents: 0,
    currency: 'USD',
    status: 'PAID',
    ...opts.payment,
  };
  const sub: Row = {
    id: 's1',
    userId: 'u1',
    plan: 'PRO',
    status: 'ACTIVE',
    dodoSubscriptionId: 'sub_1',
    dodoMode: 'live',
    ...opts.sub,
  };
  const order: string[] = [];
  const prisma = {
    payment: { findUnique: jest.fn(() => Promise.resolve(payment)) },
    subscription: {
      findUnique: jest.fn(() => Promise.resolve(sub)),
      update: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve(Object.assign(sub, data)),
      ),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 'u1', email: 'c@example.test', name: 'C' }),
      ),
    },
  };
  const dodo = {
    refund: jest.fn(() => {
      order.push('refund');
      return Promise.resolve({ refund_id: 'r1', status: 'pending' });
    }),
    updateSubscription: jest.fn(() => {
      order.push('cancel');
      return opts.cancelFails
        ? Promise.reject(new Error('Dodo is down'))
        : Promise.resolve({});
    }),
  };
  const mail = { send: jest.fn(() => Promise.resolve()) };
  const service = new BillingService(
    prisma as never,
    mail as never,
    dodo as never,
    {} as never,
    {} as never,
    { get: jest.fn(() => undefined) } as never,
  );
  return { service, dodo, sub, order };
}

describe('refunding with the subscription cancelled too', () => {
  it('refunds, then cancels, and the account is on Free', async () => {
    const { service, sub, order } = setup();
    const r = await service.adminRefund('p1', undefined, true);
    expect(order).toEqual(['refund', 'cancel']);
    expect(r.cancelled).toBe(true);
    expect(sub.plan).toBe('FREE');
  });

  it('only refunds when not asked to cancel', async () => {
    const { service, dodo } = setup();
    const r = await service.adminRefund('p1', undefined, false);
    expect(dodo.refund).toHaveBeenCalled();
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
    expect(r.cancelled).toBe(false);
  });

  it("leaves a newer subscription alone when an old one's payment is refunded", async () => {
    const { service, dodo } = setup({ sub: { dodoSubscriptionId: 'sub_2' } });
    const r = await service.adminRefund('p1', undefined, true);
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
    expect(r.cancelled).toBe(false);
    expect(r.cancelNote).toMatch(/not for their current subscription/);
  });

  it('still sends the refund when the cancel fails, and says so', async () => {
    const { service, dodo } = setup({ cancelFails: true });
    const r = await service.adminRefund('p1', undefined, true);
    expect(dodo.refund).toHaveBeenCalled();
    expect(r.cancelled).toBe(false);
    expect(r.cancelNote).toMatch(/Cancel it from Subscriptions/);
  });
});
