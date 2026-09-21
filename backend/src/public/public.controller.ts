import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { hostFrom, hostMatches } from '../sources/domain.util';
import {
  applyRatingFilter,
  normalizeSettings,
} from '../widgets/widget-settings';
import { widgetScript } from './widget-script';

/**
 * The only endpoints a customer's website talks to. No auth token here - the
 * widget's public key identifies it, and the caller's Origin has to be a
 * domain the owner registered. Copying the snippet to another site gets a 403.
 */
@Controller('embed')
@Throttle({ default: { ttl: 60_000, limit: 600 } })
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ReviewsEngineService,
    private readonly billing: BillingService,
  ) {}

  private originOf(req: Request): string | null {
    return hostFrom(req.headers.origin || req.headers.referer);
  }

  private async resolve(key: string, req: Request) {
    const widget = await this.prisma.widget.findUnique({
      where: { publicKey: key },
      include: { sources: { select: { domain: true } } },
    });
    if (!widget)
      return { ok: false as const, error: 'Unknown widget key', status: 404 };

    const accountWide = await this.prisma.source.findMany({
      where: { userId: widget.userId, widgetId: null },
      select: { domain: true },
    });
    const allowed = [...widget.sources, ...accountWide].map((s) => s.domain);

    const host = this.originOf(req);
    if (allowed.length === 0) {
      return {
        ok: false as const,
        error:
          'This widget has no allowed domains yet. Add one under Sources first.',
        status: 403,
      };
    }
    if (!host) {
      return {
        ok: false as const,
        error:
          'No Origin header - embed this on a web page, not a direct call.',
        status: 403,
      };
    }
    if (!hostMatches(host, allowed)) {
      return {
        ok: false as const,
        error: `${host} is not an allowed domain for this widget.`,
        status: 403,
      };
    }

    return { ok: true as const, widget, host };
  }

  /** The <script> tag. Always 200 so a bad domain shows a console error, not a broken page. */
  @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  script(
    @Query('key') key: string,
    @Query('preview') preview: string,
    @Res() res: Response,
  ) {
    res.send(widgetScript(key ?? '', preview === '1'));
  }

  @Get('widgets/:key/reviews')
  async reviews(
    @Param('key') key: string,
    @Query('count') count: string | undefined,
    @Query('sort') sort: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const resolved = await this.resolve(key, req);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const { widget, host } = resolved;

    // Anything cross-origin needs CORS, and the allow list has already run.
    const origin = (req.headers.origin as string) || '';
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');

    // Every render counts against the owner's monthly views, and the plan
    // decides how many reviews a widget may show.
    const usage = await this.billing.recordView(widget.userId);
    if (!usage.allowed) {
      return res.status(402).json({
        error:
          'This widget has used its monthly views. The owner can upgrade to show it again.',
      });
    }

    const settings = normalizeSettings(widget.settings);
    // data-count on the snippet wins, then the widget's own setting; the plan
    // is the ceiling either way.
    const wanted = Math.floor(Number(count)) || settings.reviewCount || 0;
    const shown = Math.min(wanted || usage.reviews, usage.reviews);
    // A rating filter drops some reviews, so ask for the full allowance first.
    const minRating = Number(settings.minRating) || 0;
    const result = await this.engine.fetch(
      widget.placeId,
      minRating > 0 ? usage.reviews : shown,
      sort || settings.sort || 'mostRelevant',
    );
    const reviews = applyRatingFilter(result.reviews, settings).slice(0, shown);

    // Best effort - a counter is not worth failing a page render over.
    this.prisma.source
      .updateMany({
        where: { userId: widget.userId, domain: host },
        data: { hits: { increment: 1 }, lastSeen: new Date() },
      })
      .catch(() => undefined);

    return res.json({
      widget: {
        placeName: widget.placeName,
        placeAddress: widget.placeAddress,
        settings,
        // Google's own "leave a review" form for this place.
        writeReviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(widget.placeId)}`,
      },
      business: result.business,
      reviews,
      link: result.link,
      served: result.served,
      took_ms: result.took_ms,
      error: result.error,
    });
  }
}
