import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Everything the super admin panel shows. Read-only apart from role changes. */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
