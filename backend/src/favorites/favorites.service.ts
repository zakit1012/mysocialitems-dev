import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        deal: {
          include: {
            category: true,
            merchant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row.deal,
      highlights: this.parseHighlights(row.deal.highlights),
      discountPercent: Math.round(
        (1 - row.deal.dealPrice / row.deal.originalPrice) * 100,
      ),
      favorited: true,
    }));
  }

  async toggle(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_dealId: { userId, dealId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await this.prisma.favorite.create({ data: { userId, dealId } });
    return { favorited: true };
  }

  private parseHighlights(value: string) {
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }
}
