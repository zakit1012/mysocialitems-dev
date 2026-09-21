import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Everything the super admin panel shows. Read-only apart from role changes. */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, widgets, sources, deals, vouchers, reviews] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.widget.count(),
      this.prisma.source.count(),
      this.prisma.deal.count(),
      this.prisma.voucher.count(),
      this.prisma.review.count(),
    ]);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const newUsers = await this.prisma.user.count({
      where: { createdAt: { gte: since } },
    });
    return { users, widgets, sources, deals, vouchers, reviews, newUsers };
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
        createdAt: true,
        _count: { select: { widgets: true, sources: true, deals: true, vouchers: true } },
      },
    });
  }

  widgets() {
    return this.prisma.widget.findMany({
      orderBy: { createdAt: 'desc' },
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

  setRole(userId: string, role: string) {
    const allowed = ['USER', 'MERCHANT', 'ADMIN'];
    const next = allowed.includes(role) ? role : 'USER';
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: next },
      select: { id: true, email: true, role: true },
    });
  }
}
