import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { voucherCode } from '../common/utils/slug';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    if (user.role === 'MERCHANT' || user.role === 'ADMIN') {
      return this.prisma.voucher.findMany({
        where: user.role === 'ADMIN' ? {} : { deal: { merchantId: user.id } },
        include: {
          deal: {
            select: { id: true, title: true, imageUrl: true, city: true },
          },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { purchasedAt: 'desc' },
      });
    }

    return this.prisma.voucher.findMany({
      where: { userId: user.id },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            city: true,
            location: true,
            validUntil: true,
          },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  async purchase(userId: string, dealId: string, quantity: number) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await tx.deal.findUnique({ where: { id: dealId } });
      if (!deal || !deal.published) {
        throw new NotFoundException('Deal not found');
      }
      if (deal.validUntil < new Date()) {
        throw new BadRequestException('This deal has expired');
      }
      if (deal.stock < quantity) {
        throw new BadRequestException('Not enough vouchers left');
      }

      const voucher = await tx.voucher.create({
        data: {
          code: voucherCode(),
          quantity,
          totalPaid: Number((deal.dealPrice * quantity).toFixed(2)),
          userId,
          dealId,
        },
        include: {
          deal: {
            select: { id: true, title: true, imageUrl: true, city: true },
          },
        },
      });

      await tx.deal.update({
        where: { id: dealId },
        data: {
          stock: { decrement: quantity },
          soldCount: { increment: quantity },
        },
      });

      return voucher;
    });
  }

  async redeem(user: AuthUser, id: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: { deal: true },
    });
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }
    if (user.role !== 'ADMIN' && voucher.deal.merchantId !== user.id) {
      throw new ForbiddenException('Only the merchant can redeem this voucher');
    }
    if (voucher.status === 'REDEEMED') {
      throw new BadRequestException('Voucher already redeemed');
    }

    return this.prisma.voucher.update({
      where: { id },
      data: { status: 'REDEEMED', redeemedAt: new Date() },
      include: {
        deal: { select: { id: true, title: true } },
        user: { select: { name: true, email: true } },
      },
    });
  }
}
