import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { CreateWidgetDto } from './dto/create-widget.dto';

@Injectable()
export class WidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
  ) {}

  list(userId: string) {
    return this.prisma.widget.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateWidgetDto) {
    const place = await this.places.details(dto.placeId, dto.sessionToken);
    return this.prisma.widget.create({
      data: {
        userId,
        // Goes in the embed snippet; the widget id stays private.
        publicKey: `wk_${randomBytes(16).toString('hex')}`,
        placeId: place.placeId,
        placeName: place.name,
        placeAddress: place.address,
        settings: dto.settings ?? {},
      },
    });
  }

  get(userId: string, id: string) {
    return this.prisma.widget.findUnique({
      where: { id, userId },
    });
  }

  update(userId: string, id: string, dto: { settings?: any }) {
    return this.prisma.widget.update({
      where: { id, userId },
      data: { settings: dto.settings },
    });
  }

  delete(userId: string, id: string) {
    return this.prisma.widget.delete({
      where: { id, userId },
    });
  }
}
