import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPaidPlan } from '../billing/plans';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { BillingService } from '../billing/billing.service';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import {
  PRO_LAYOUTS,
  layoutName,
  mergeSettings,
  normalizeSettings,
} from './widget-settings';

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
    private readonly engine: ReviewsEngineService,
  ) {}

  async list(userId: string) {
    const [rows, cover] = await Promise.all([
      this.prisma.widget.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        // The logo is only needed on the review tools page.
        omit: { logo: true },
      }),
      this.billing.coverage(userId),
    ]);
    // Paused: over the plan's widget limit, so the embed does not show it.
    return rows.map((w) => ({
      ...withSettings(w),
      paused: !cover.widgets.has(w.id),
    }));
  }

  /** Pro designs need a paid plan; the editor lets Free accounts try them only. */
  private async assertLayoutAllowed(userId: string, layout?: string) {
    if (!layout || !PRO_LAYOUTS.includes(layout)) return;
    if (isPaidPlan(await this.billing.planFor(userId))) return;
    throw new ForbiddenException(
      `${layoutName(layout)} is a Pro design. Upgrade to use it, or pick Grid, List or Carousel.`,
    );
  }

  async create(userId: string, dto: CreateWidgetDto) {
    await this.billing.assertCanAdd(userId, 'widgets');
    await this.assertLayoutAllowed(
      userId,
      normalizeSettings(dto.settings).layout,
    );
    // Google checks the place is a real business. Its Places content (name,
    // address) may not be stored - only the place ID - so the name comes from
    // the review engine, which the preview has just filled for this place.
    const place = await this.places.details(dto.placeId, dto.sessionToken);
    const engine = await this.engine.fetch(place.placeId, 1, 'mostRelevant');
    const widget = await this.prisma.widget.create({
      data: {
        userId,
        // Goes in the embed snippet; the widget id stays private.
        publicKey: `wk_${randomBytes(16).toString('hex')}`,
        placeId: place.placeId,
        // Only if the engine has nothing yet; the owner's next preview
        // replaces it (see syncName).
        placeName: engine.business?.name || place.name,
        settings: normalizeSettings(dto.settings),
      },
      omit: { logo: true },
    });
    return withSettings(widget);
  }

  /** Keeps the stored name to the one the review engine shows for the place. */
  async syncName(userId: string, id: string, name: string | null | undefined) {
    if (!name) return;
    await this.prisma.widget
      .updateMany({
        where: { id, userId, NOT: { placeName: name } },
        data: { placeName: name },
      })
      .catch(() => undefined);
  }

  /** The poster logo, kept off every other widget read because of its size. */
  async getLogo(userId: string, id: string) {
    const widget = await this.prisma.widget.findUnique({
      where: { id, userId },
      select: { logo: true },
    });
    if (!widget) throw new NotFoundException('Widget not found.');
    return { logo: widget.logo };
  }

  /**
   * The business logo for the review QR poster (Pro and Business). A small
   * image data URL, already resized in the browser; null removes it.
   */
  async setLogo(userId: string, id: string, logo: unknown) {
    const plan = await this.billing.planFor(userId);
    if (!isPaidPlan(plan)) {
      throw new ForbiddenException(
        'The review tools are part of the Pro and Business plans.',
      );
    }
    if (logo !== null) {
      if (
        typeof logo !== 'string' ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)
      ) {
        throw new BadRequestException('Upload a PNG, JPG or WebP image.');
      }
      if (logo.length > 400_000) {
        throw new BadRequestException('That logo is too large.');
      }
    }
    const { count } = await this.prisma.widget.updateMany({
      where: { id, userId },
      data: { logo: logo },
    });
    if (!count) throw new NotFoundException('Widget not found.');
    return { logo };
  }

  async get(userId: string, id: string) {
    const widget = await this.prisma.widget.findUnique({
      where: { id, userId },
      omit: { logo: true },
    });
    return widget && withSettings(widget);
  }

  async update(userId: string, id: string, dto: UpdateWidgetDto) {
    const current = await this.prisma.widget.findUnique({
      where: { id, userId },
      select: { settings: true },
    });
    if (!current) throw new NotFoundException('Widget not found.');
    if (dto.settings === undefined) return withSettings(current);
    const merged = mergeSettings(current.settings, dto.settings);
    // Only a change of design is checked: after a downgrade, a widget saved
    // with a Pro design can still have its colours edited (it shows as Grid).
    if (merged.layout !== normalizeSettings(current.settings).layout) {
      await this.assertLayoutAllowed(userId, merged.layout);
    }
    const widget = await this.prisma.widget.update({
      where: { id, userId },
      data: { settings: merged },
      omit: { logo: true },
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
