import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { RedisService } from '../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { hostFrom, hostMatches } from '../sources/domain.util';
import {
  MAX_REVIEW_COUNT,
  SORTS,
  fiveStarOnly,
  normalizeSettings,
} from '../widgets/widget-settings';
import { widgetScript } from './widget-script';

/** One visitor reloading or browsing a site counts as one view per window. */
const VIEW_WINDOW_SECONDS = 30 * 60;

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
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * True the first time this visitor loads this widget in the window. Keyed
   * by IP, so production must run with TRUST_PROXY=true behind nginx, or
   * every visitor looks like 127.0.0.1 and shares one view.
   */
  private async isNewView(widgetId: string, req: Request): Promise<boolean> {
    try {
      return await this.redis.setIfAbsent(
        `view:${widgetId}:${req.ip}`,
        VIEW_WINDOW_SECONDS,
      );
    } catch {
      // Without Redis, every load counts - the old behaviour.
      return true;
    }
  }

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

    const settings = normalizeSettings(widget.settings);
    // data-sort on the snippet may only pick one of the widget's own orders:
    // "lowest rated" would leave a 5-star-only widget empty.
    const order =
      sort && SORTS.includes(sort) ? sort : settings.sort || 'mostRelevant';
    // Only 5-star reviews are shown. Asking for just the allowance and then
    // filtering can leave one card, so take everything the engine has cached
    // for this place (no extra scrape) and cut to the allowance afterwards.
    const plan = await this.billing.planFor(widget.userId);
    const result = await this.engine.fetchCached(
      widget.placeId,
      MAX_REVIEW_COUNT,
      order,
      plan.refreshHours,
    );

    // A place loaded for the first time is still being collected, and the
    // script asks again every 4s (up to 15 times). Those retries are not
    // views - nothing is shown yet - so they must not use up the allowance.
    if (result.served === 'fetching') {
      return res.json({ served: 'fetching' });
    }

    // A shown widget counts against the owner's monthly views (once per
    // visitor per window), and the plan decides how many reviews it shows.
    const isNew = await this.isNewView(widget.id, req);
    const usage = await this.billing.recordView(widget.userId, isNew, plan);
    if (!usage.allowed) {
      // Shown to the owner as visitors their widget missed.
      void this.analytics.record(widget.id, { missed: isNew ? 1 : 0 });
      return res.status(402).json({
        error:
          'This widget has used its monthly views. The owner can upgrade to show it again.',
      });
    }

    void this.analytics.record(widget.id, { loads: 1, views: isNew ? 1 : 0 });

    // data-count on the snippet wins, then the widget's own setting; the plan
    // is the ceiling either way.
    const wanted = Math.floor(Number(count)) || settings.reviewCount || 0;
    const shown = Math.min(wanted || usage.reviews, usage.reviews);
    const reviews = fiveStarOnly(result.reviews).slice(0, shown);

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

  /**
   * A click on "Write a review" or "See all reviews", sent by the script with
   * navigator.sendBeacon. Analytics only; the answer is never read.
   */
  @Post('widgets/:key/click')
  @HttpCode(204)
  async click(@Param('key') key: string, @Req() req: Request) {
    const resolved = await this.resolve(key, req);
    if (resolved.ok)
      await this.analytics.record(resolved.widget.id, { clicks: 1 });
  }
}
