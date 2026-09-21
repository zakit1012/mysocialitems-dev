import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dealId: string, dto: CreateReviewDto) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const purchased = await this.prisma.voucher.findFirst({
      where: { userId, dealId },
    });
    if (!purchased) {
      throw new BadRequestException('Buy this deal before leaving a review');
    }

    return this.prisma.review.upsert({
      where: { userId_dealId: { userId, dealId } },
      create: {
        userId,
        dealId,
        rating: dto.rating,
        comment: dto.comment,
      },
      update: {
        rating: dto.rating,
        comment: dto.comment,
      },
      include: { user: { select: { id: true, name: true } } },
    });
  }
}
