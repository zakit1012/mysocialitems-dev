import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { MailService } from '../mail/mail.service';
import { PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';

/** Everything the super admin panel shows, role changes and deleting accounts. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly mail: MailService,
  ) {}

  async overview() {
    const [users, widgets, sources] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.widget.count(),
      this.prisma.source.count(),
    ]);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const newUsers = await this.prisma.user.count({
      where: { createdAt: { gte: since } },
    });
    // Developer accounts on test-mode subscriptions pay nothing: not counted.
    const paying = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        plan: { not: 'FREE' },
        OR: [{ dodoMode: null }, { dodoMode: { not: 'test' } }],
      },
    });
    return {
      users,
      widgets,
      sources,
      newUsers,
      paying,
    };
  }

  users() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        city: true,
        testPayments: true,
        createdAt: true,
        _count: {
          select: { widgets: true, sources: true },
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            currentPeriodEnd: true,
            dodoMode: true,
          },
        },
      },
    });
  }

  widgets() {
    return this.prisma.widget.findMany({
      orderBy: { createdAt: 'desc' },
      omit: { logo: true },
      include: {
        user: { select: { id: true, email: true, name: true } },
        sources: { select: { domain: true, hits: true } },
      },
    });
  }

  sources() {
    return this.prisma.source.findMany({
      orderBy: [{ hits: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, email: true } },
        widget: { select: { id: true, placeName: true } },
      },
    });
  }

  /**
   * Deletes an account and everything in it (widgets, domains, review links
   * and posters), like the owner's own "Delete account". A running
   * subscription is cancelled first, so nothing is charged again - if that
   * fails, nothing is deleted. Payment records stay, without the account,
   * for the books. Admins are not deleted here: remove the role first.
   */
  async deleteUser(adminId: string, userId: string) {
    if (userId === adminId) {
      throw new BadRequestException('You cannot delete your own account here.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('That account is already gone.');
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Admin accounts cannot be deleted. Remove the admin role first.',
      );
    }
    await this.billing.closeForDeletion(
      userId,
      'because an admin deleted their account',
    );
    await this.prisma.user.delete({ where: { id: userId } });
    void this.mail.send(user.email, 'Your account is deleted', [
      `Hi ${user.name},`,
      `Your ${PRODUCT_NAME} account, widgets and settings were deleted by our team, and any subscription is cancelled - you will not be charged again. Your widgets no longer show on your website.`,
      `If you think this is a mistake, write to ${SUPPORT_EMAIL}.`,
    ]);
    return { ok: true, email: user.email };
  }

  setRole(userId: string, role: unknown) {
    const allowed = ['USER', 'MERCHANT', 'ADMIN'];
    // A missing or mistyped role must not quietly demote someone.
    if (typeof role !== 'string' || !allowed.includes(role)) {
      throw new BadRequestException(
        `Role must be one of ${allowed.join(', ')}.`,
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  }
}
