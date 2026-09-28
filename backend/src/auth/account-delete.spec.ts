import { AuthService } from './auth.service';

// @nestjs/config and @nestjs/jwt ship as ESM, which jest's CommonJS
// runtime cannot load; only their classes are needed here, as tokens.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * Deleting an account takes a code sent to the account's own email - a
 * password may be shared, so it is not enough. The subscription is
 * cancelled first; if that fails, nothing is deleted.
 */

function setup(opts: { role?: string; closeFails?: boolean } = {}) {
  const user = {
    id: 'u1',
    email: 'owner@example.test',
    name: 'Owner',
    role: opts.role ?? 'USER',
  };
  const store = new Map<string, unknown>();
  const counts = new Map<string, number>();
  const redis = {
    setJson: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getJson: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: jest.fn((key: string) => {
      store.delete(key);
      counts.delete(key);
      return Promise.resolve();
    }),
    setIfAbsent: jest.fn(() => Promise.resolve(true)),
    incrWithTtl: jest.fn((key: string) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return Promise.resolve(n);
    }),
  };
  const order: string[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(() => Promise.resolve(user)),
      delete: jest.fn(() => {
        order.push('delete account');
        return Promise.resolve(user);
      }),
    },
  };
  const mail = {
    sendCode: jest.fn(() => Promise.resolve()),
    send: jest.fn(() => Promise.resolve()),
  };
  const billing = {
    closeForDeletion: jest.fn(() => {
      order.push('cancel subscription');
      return opts.closeFails
        ? Promise.reject(new Error('Dodo is down'))
        : Promise.resolve();
    }),
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    redis as never,
    mail as never,
    billing as never,
  );
  /** The code the last email carried. */
  const sentCode = () =>
    (mail.sendCode.mock.calls.at(-1) as unknown as [string, string, string])[1];
  return { service, prisma, mail, billing, order, sentCode };
}

describe('deleting an account', () => {
  it("sends the code to the account's own email", async () => {
    const { service, mail } = setup();
    await service.sendDeleteCode('u1');
    await new Promise((done) => setImmediate(done));
    expect(mail.sendCode).toHaveBeenCalledWith(
      'owner@example.test',
      expect.stringMatching(/^\d{6}$/),
      'delete',
    );
  });

  it('deletes nothing with a wrong code', async () => {
    const { service, prisma, billing } = setup();
    await service.sendDeleteCode('u1');
    await expect(service.deleteAccount('u1', '000000')).rejects.toThrow(
      /Invalid or expired code/,
    );
    expect(billing.closeForDeletion).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes nothing without a code asked for first', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteAccount('u1', '123456')).rejects.toThrow(
      /Invalid or expired code/,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('with the right code: cancels the subscription, then deletes', async () => {
    const { service, order, sentCode } = setup();
    await service.sendDeleteCode('u1');
    await new Promise((done) => setImmediate(done));
    await service.deleteAccount('u1', sentCode());
    expect(order).toEqual(['cancel subscription', 'delete account']);
  });

  it('keeps the account when the subscription cannot be cancelled', async () => {
    const { service, prisma, sentCode } = setup({
      closeFails: true,
    });
    await service.sendDeleteCode('u1');
    await new Promise((done) => setImmediate(done));
    await expect(service.deleteAccount('u1', sentCode())).rejects.toThrow(
      /Dodo is down/,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('a code works once', async () => {
    const { service, prisma, sentCode } = setup();
    await service.sendDeleteCode('u1');
    await new Promise((done) => setImmediate(done));
    const code = sentCode();
    await service.deleteAccount('u1', code);
    await expect(service.deleteAccount('u1', code)).rejects.toThrow(
      /Invalid or expired code/,
    );
    expect(prisma.user.delete).toHaveBeenCalledTimes(1);
  });

  it('never deletes an admin', async () => {
    const { service, mail } = setup({ role: 'ADMIN' });
    await expect(service.sendDeleteCode('u1')).rejects.toThrow(
      /Admin accounts cannot be deleted/,
    );
    expect(mail.sendCode).not.toHaveBeenCalled();
  });
});
