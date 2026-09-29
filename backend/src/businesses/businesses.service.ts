import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { isPaidPlan } from '../billing/plans';
import { statDay } from '../analytics/analytics.service';
import { siteUrl } from '../common/urls';

/** Letters and digits nobody mixes up when typing a link off a poster. */
const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const SLUG_LENGTH = 7;
/** Link previews and crawlers open links too; they are not people scanning. */
const NOT_A_PERSON =
  /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|embedly|curl|wget|python|axios|node-fetch|go-http/i;

/** The Google form where a customer writes a review of the place. */
export const writeReviewUrl = (placeId: string) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

function newSlug() {
  // 32 characters: every byte maps evenly onto them.
  return [...randomBytes(SLUG_LENGTH)]
    .map((b) => SLUG_CHARS[b % SLUG_CHARS.length])
    .join('');
}

/**
 * The businesses an account shows reviews for - one each, however many of
 * its widgets show it - with what the review tools keep for them: the
 * poster logo and colour, and a short review link that counts its opens.
 */
@Injectable()
export class BusinessesService {
  private readonly log = new Logger(BusinessesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Every business the account's widgets show, in the order the widgets
   * were made. A business is recorded the first time it is listed, taking
   * the poster logo a widget of it had before businesses existed.
   */
  async list(userId: string) {
    const widgets = await this.prisma.widget.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { placeId: true, placeName: true, placeAddress: true },
    });
    // One entry per place; the newest widget's name and address win.
    const places = new Map<string, { name: string; address: string | null }>();
    for (const w of widgets) {
      places.set(w.placeId, { name: w.placeName, address: w.placeAddress });
    }
    if (!places.size) return [];

    const known = await this.prisma.business.findMany({
      where: { userId, placeId: { in: [...places.keys()] } },
    });
    const byPlace = new Map(known.map((b) => [b.placeId, b]));
    for (const [placeId, place] of places) {
      const had = byPlace.get(placeId);
      if (!had) {
        byPlace.set(placeId, await this.create(userId, placeId, place.name));
      } else if (had.placeName !== place.name) {
        byPlace.set(
          placeId,
          await this.prisma.business.update({
            where: { id: had.id },
            data: { placeName: place.name },
          }),
        );
      }
    }

    // How often each link is opened shows on the analytics page.
    const site = siteUrl(this.config);

    return [...places].map(([placeId, place]) => {
      const b = byPlace.get(placeId)!;
      return {
        id: b.id,
        placeId,
        placeName: b.placeName,
        placeAddress: place.address,
        logo: b.logo,
        posterColor: b.posterColor,
        link: `${site}/r/${b.slug}`,
      };
    });
  }

  /** A new business row with a fresh slug (and the old widget logo, if any). */
  private async create(userId: string, placeId: string, placeName: string) {
    const old = await this.prisma.widget.findFirst({
      where: { userId, placeId, logo: { not: null } },
      select: { logo: true },
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.business.create({
          data: {
            userId,
            placeId,
            placeName,
            logo: old?.logo ?? null,
            slug: newSlug(),
          },
        });
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
        // Listed twice at once: the other request made it.
        const made = await this.prisma.business.findUnique({
          where: { userId_placeId: { userId, placeId } },
        });
        if (made) return made;
        // Otherwise the slug was taken: try another.
      }
    }
    throw new Error('Could not make a unique review link.');
  }

  private async owned(userId: string, id: string) {
    const plan = await this.billing.planFor(userId);
    if (!isPaidPlan(plan)) {
      throw new ForbiddenException(
        'The review tools are part of the Pro and Business plans.',
      );
    }
    const business = await this.prisma.business.findFirst({
      where: { id, userId },
    });
    if (!business) throw new NotFoundException('Business not found.');
    return business;
  }

  /** The poster logo: a small image data URL, already resized in the browser; null removes it. */
  async setLogo(userId: string, id: string, logo: unknown) {
    await this.owned(userId, id);
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
    await this.prisma.business.update({ where: { id }, data: { logo } });
    return { logo };
  }

  /** The poster colour, like #0096D6; null goes back to the default. */
  async setPosterColor(userId: string, id: string, color: unknown) {
    await this.owned(userId, id);
    if (
      color !== null &&
      !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    ) {
      throw new BadRequestException('Pick a colour like #0096D6.');
    }
    await this.prisma.business.update({
      where: { id },
      data: { posterColor: color },
    });
    return { posterColor: color };
  }

  /**
   * Someone opened a short review link: where to send them, counting the
   * open when it is a person (not a link preview or a crawler). Null for a
   * link that does not exist. Counting never holds up the redirect.
   */
  async open(slug: string, userAgent?: string): Promise<string | null> {
    if (!/^[a-z0-9]{4,20}$/.test(slug)) return null;
    const business = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, placeId: true },
    });
    if (!business) return null;
    if (userAgent && !NOT_A_PERSON.test(userAgent)) {
      const day = statDay();
      await this.prisma.reviewLinkOpen
        .upsert({
          where: { businessId_day: { businessId: business.id, day } },
          create: { businessId: business.id, day, opens: 1 },
          update: { opens: { increment: 1 } },
        })
        .catch((err: unknown) =>
          this.log.warn(`Could not count an open of ${slug}: ${String(err)}`),
        );
    }
    return writeReviewUrl(business.placeId);
  }
}
