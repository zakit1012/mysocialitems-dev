import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { BillingService } from '../billing/billing.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { mergeSettings, normalizeSettings } from './widget-settings';

/** Stored settings may predate the current format; always hand out the current one. */
function withSettings<T extends { settings: unknown }>(widget: T): T {
  return { ...widget, settings: normalizeSettings(widget.settings) };
}

@Injectable()
export class WidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
    private readonly billing: BillingService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.widget.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(withSettings);
  }

  async create(userId: string, dto: CreateWidgetDto) {
    await this.billing.assertCanAdd(userId, 'widgets');
    const place = await this.places.details(dto.placeId, dto.sessionToken);
    const widget = await this.prisma.widget.create({
      data: {
        userId,
        // Goes in the embed snippet; the widget id stays private.
        publicKey: `wk_${randomBytes(16).toString('hex')}`,
        placeId: place.placeId,
        placeName: place.name,
        placeAddress: place.address,
        settings: normalizeSettings(dto.settings),
      },
    });
    return withSettings(widget);
  }

  async get(userId: string, id: string) {
    const widget = await this.prisma.widget.findUnique({
      where: { id, userId },
    });
    return widget && withSettings(widget);
  }

  async update(userId: string, id: string, dto: UpdateWidgetDto) {
    const current = await this.prisma.widget.findUnique({
      where: { id, userId },
    });
    if (!current) throw new NotFoundException('Widget not found.');
    if (dto.settings === undefined) return withSettings(current);
    const widget = await this.prisma.widget.update({
      where: { id, userId },
      data: { settings: mergeSettings(current.settings, dto.settings) },
    });
    return withSettings(widget);
  }

  async delete(userId: string, id: string) {
    const { count } = await this.prisma.widget.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('Widget not found.');
    return { ok: true };
  }
}
