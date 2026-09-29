import { AdminService } from './admin.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * An admin can delete any account but their own and other admins'. As with
 * "Delete account", the subscription is cancelled first; if that fails,
 * nothing is deleted.
 */

function setup(
  opts: { role?: string; missing?: boolean; closeFails?: boolean } = {},
) {
  const user = {
    id: 'u1',
    email: 'owner@example.test',
    name: 'Owner',
    role: opts.role ?? 'USER',
  };
  const order: string[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(() => Promise.resolve(opts.missing ? null : user)),
      delete: jest.fn(() => {
        order.push('delete account');
        return Promise.resolve(user);
      }),
    },
  };
  const billing = {
    closeForDeletion: jest.fn(() => {
      order.push('cancel subscription');
      return opts.closeFails
        ? Promise.reject(new Error('Dodo is down'))
        : Promise.resolve();
    }),
  };
  const mail = { send: jest.fn(() => Promise.resolve()) };
  const service = new AdminService(
    prisma as never,
    billing as never,
    mail as never,
  );
  return { service, prisma, billing, mail, order };
}

describe('an admin deleting an account', () => {
  it('cancels the subscription, then deletes, then tells the owner', async () => {
    const { service, order, mail } = setup();
    await expect(service.deleteUser('admin1', 'u1')).resolves.toEqual({
      ok: true,
      email: 'owner@example.test',
    });
    expect(order).toEqual(['cancel subscription', 'delete account']);
    expect(mail.send).toHaveBeenCalledWith(
      'owner@example.test',
      'Your account is deleted',
      expect.any(Array),
    );
  });

  it('keeps the account when the subscription cannot be cancelled', async () => {
    const { service, prisma, mail } = setup({ closeFails: true });
    await expect(service.deleteUser('admin1', 'u1')).rejects.toThrow(
      /Dodo is down/,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('never deletes their own account', async () => {
    const { service, prisma, billing } = setup();
    await expect(service.deleteUser('u1', 'u1')).rejects.toThrow(
      /your own account/,
    );
    expect(billing.closeForDeletion).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('never deletes an admin', async () => {
    const { service, prisma, billing } = setup({ role: 'ADMIN' });
    await expect(service.deleteUser('admin1', 'u1')).rejects.toThrow(
      /Remove the admin role first/,
    );
    expect(billing.closeForDeletion).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('says so when the account is already gone', async () => {
    const { service, prisma } = setup({ missing: true });
    await expect(service.deleteUser('admin1', 'u1')).rejects.toThrow(
      /already gone/,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
