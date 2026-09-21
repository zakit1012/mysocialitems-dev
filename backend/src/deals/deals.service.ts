import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';
import { uniqueSlug } from '../common/utils/slug';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const dealInclude = {
  category: true,
  merchant: { select: { id: true, name: true, city: true } },
  reviews: { select: { rating: true } },
} satisfies Prisma.DealInclude;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryDealsDto, userId?: string) {
    const take = Math.min(query.take ?? 24, 50);
    const skip = query.skip ?? 0;
    const where: Prisma.DealWhereInput = { published: true };

    if (query.city) {
      where.city = { equals: query.city };
    }
    if (query.category) {
      where.category = { slug: query.category };
    }
    if (query.featured === 'true') {
      where.featured = true;
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q } },
        { description: { contains: query.q } },
        { city: { contains: query.q } },
        { location: { contains: query.q } },
      ];
    }

    const [items, total, cities] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: dealInclude,
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where: { published: true },
        distinct: ['city'],
        select: { city: true },
        orderBy: { city: 'asc' },
      }),
    ]);

    const favoriteIds = await this.favoriteIds(
      userId,
      items.map((d) => d.id),
    );

    return {
      items: items.map((deal) => this.shape(deal, favoriteIds.has(deal.id))),
      total,
      cities: cities.map((c) => c.city),
    };
  }

  async findOne(idOrSlug: string, userId?: string) {
    const deal = await this.prisma.deal.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        ...dealInclude,
        reviews: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    const favoriteIds = await this.favoriteIds(userId, [deal.id]);
    return this.shape(deal, favoriteIds.has(deal.id), true);
  }

  async mine(user: AuthUser) {
    const items = await this.prisma.deal.findMany({
      where: user.role === 'ADMIN' ? {} : { merchantId: user.id },
      include: dealInclude,
      orderBy: { createdAt: 'desc' },
    });
    return items.map((deal) => this.shape(deal, false));
  }

  async create(user: AuthUser, dto: CreateDealDto) {
    const deal = await this.prisma.deal.create({
      data: {
        title: dto.title,
        slug: uniqueSlug(dto.title),
        description: dto.description,
        highlights: this.normalizeHighlights(dto.highlights),
        imageUrl: dto.imageUrl,
        originalPrice: dto.originalPrice,
        dealPrice: dto.dealPrice,
        city: dto.city,
        location: dto.location,
        stock: dto.stock,
        validUntil: new Date(dto.validUntil),
        featured: dto.featured ?? false,
        categoryId: dto.categoryId,
        merchantId: user.id,
      },
      include: dealInclude,
    });
    return this.shape(deal, false);
  }

  async update(user: AuthUser, id: string, dto: UpdateDealDto) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Deal not found');
    }
    this.assertOwner(user, existing.merchantId);

    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.highlights !== undefined && {
          highlights: this.normalizeHighlights(dto.highlights),
        }),
        ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
        ...(dto.originalPrice !== undefined && {
          originalPrice: dto.originalPrice,
        }),
        ...(dto.dealPrice !== undefined && { dealPrice: dto.dealPrice }),
        ...(dto.city && { city: dto.city }),
        ...(dto.location && { location: dto.location }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.featured !== undefined && { featured: dto.featured }),
      },
      include: dealInclude,
    });
    return this.shape(deal, false);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Deal not found');
    }
    this.assertOwner(user, existing.merchantId);
    await this.prisma.deal.delete({ where: { id } });
    return { ok: true };
  }

  private assertOwner(user: AuthUser, merchantId: string) {
    if (user.role !== 'ADMIN' && user.id !== merchantId) {
      throw new ForbiddenException('You can only manage your own deals');
    }
  }

  private normalizeHighlights(value?: string) {
    if (!value) {
      return '[]';
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch {
      // treat as newline/comma list
    }
    const items = value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    return JSON.stringify(items);
  }

  private async favoriteIds(userId: string | undefined, dealIds: string[]) {
    if (!userId || !dealIds.length) {
      return new Set<string>();
    }
    const rows = await this.prisma.favorite.findMany({
      where: { userId, dealId: { in: dealIds } },
      select: { dealId: true },
    });
    return new Set(rows.map((row) => row.dealId));
  }

  private shape(
    deal: Prisma.DealGetPayload<{ include: typeof dealInclude }> & {
      reviews?: Array<{
        rating: number;
        comment?: string;
        createdAt?: Date;
        user?: { id: string; name: string };
      }>;
    },
    favorited: boolean,
    withReviews = false,
  ) {
    const ratings = deal.reviews ?? [];
    const avgRating =
      ratings.length === 0
        ? 0
        : ratings.reduce((sum, review) => sum + review.rating, 0) /
          ratings.length;
    let highlights: string[] = [];
    try {
      highlights = JSON.parse(deal.highlights) as string[];
    } catch {
      highlights = [];
    }

    return {
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description,
      highlights,
      imageUrl: deal.imageUrl,
      originalPrice: deal.originalPrice,
      dealPrice: deal.dealPrice,
      discountPercent: Math.round(
        (1 - deal.dealPrice / deal.originalPrice) * 100,
      ),
      city: deal.city,
      location: deal.location,
      stock: deal.stock,
      soldCount: deal.soldCount,
      validUntil: deal.validUntil,
      featured: deal.featured,
      published: deal.published,
      category: deal.category,
      merchant: deal.merchant,
      avgRating: Number(avgRating.toFixed(1)),
      reviewCount: ratings.length,
      favorited,
      createdAt: deal.createdAt,
      ...(withReviews ? { reviews: deal.reviews } : {}),
    };
  }
}
