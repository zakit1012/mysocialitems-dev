import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { normalizeDomain } from './domain.util';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  list(userId: string) {
    return this.prisma.source.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { widget: { select: { id: true, placeName: true } } },
    });
  }

  async create(userId: string, domainInput: unknown, widgetId?: string) {
    const domain = normalizeDomain(domainInput);
    if (!domain) {
      throw new BadRequestException(
        'That does not look like a domain. Try something like example.com',
      );
    }

    if (widgetId) {
      const widget = await this.prisma.widget.findFirst({
        where: { id: widgetId, userId },
      });
      if (!widget) throw new NotFoundException('Widget not found');
    }

    const existing = await this.prisma.source.findFirst({
      where: { userId, domain },
    });
    if (existing) throw new ConflictException(`${domain} is already added`);

    await this.billing.assertCanAdd(userId, 'sources');

    return this.prisma.source.create({
      data: { userId, domain, widgetId: widgetId ?? null },
    });
  }

  async remove(userId: string, id: string) {
    const source = await this.prisma.source.findFirst({
      where: { id, userId },
    });
    if (!source) throw new NotFoundException('Source not found');
    await this.prisma.source.delete({ where: { id } });
    return { ok: true };
  }

  /** Domains this widget may be embedded on: its own, plus account-wide ones. */
  allowedFor(userId: string, widgetId: string) {
    return this.prisma.source.findMany({
      where: { userId, OR: [{ widgetId }, { widgetId: null }] },
      select: { id: true, domain: true },
    });
  }
}
