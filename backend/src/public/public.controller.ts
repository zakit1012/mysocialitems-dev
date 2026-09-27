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
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { isPaidPlan } from '../billing/plans';
import { RedisService } from '../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { HiddenReviewsService } from '../moderation/hidden-reviews.service';
import { hostFrom, hostMatches } from '../sources/domain.util';
import {
  MAX_REVIEW_COUNT,
  PRO_LAYOUTS,
  backgroundMode,
  normalizeSettings,
} from '../widgets/widget-settings';
import {
  HIGHEST_RATED,
  pickReviews,
  widgetOrder,
} from '../widgets/review-picker';
import type { EngineReview } from '../reviews-engine/reviews-engine.service';
import { widgetScript } from './widget-script';
import { siteUrl } from '../common/urls';

/** "Installed and live" is written at most this often per widget, not on every load. */
const SEEN_EVERY_SECONDS = 10 * 60;
/** A visitor never waits longer than this for the fill-up reviews. */
const FILL_WAIT_MS = 2500;

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
    private readonly config: ConfigService,
    private readonly hidden: HiddenReviewsService,
  ) {}

  /** Our site, for the "Powered by" link on Free widgets. */
  private siteUrl(): string {
    return siteUrl(this.config);
  }

  /** True when "last seen" is due to be written again for this widget. */
  private async seenDue(widgetId: string): Promise<boolean> {
    try {
      return await this.redis.setIfAbsent(
        `seen:${widgetId}`,
        SEEN_EVERY_SECONDS,
      );
    } catch {
      return true;
    }
  }

  /**
   * A place's highest-rated reviews, to fill a paid widget whose own order
   * has too few 5-star ones. A visitor never waits long for them: the first
   * time a place needs them the engine starts on them and the widget shows
   * what it has; later views get the fuller list from the cache.
   */
  private async highestRated(
    placeId: string,
    planHours: number,
  ): Promise<EngineReview[]> {
    const result = await Promise.race([
      this.engine.fetchCached(
        placeId,
        MAX_REVIEW_COUNT,
        HIGHEST_RATED,
        planHours,
      ),
      new Promise<null>((done) => setTimeout(() => done(null), FILL_WAIT_MS)),
    ]);
    return result && result.served !== 'fetching' && !result.error
      ? result.reviews
      : [];
  }

  private originOf(req: Request): string | null {
    return hostFrom(req.headers.origin || req.headers.referer);
  }

  private async resolve(key: string, req: Request) {
    const widget = await this.prisma.widget.findUnique({
      where: { publicKey: key },
      include: { sources: { select: { id: true, domain: true } } },
      // Every page view lands here; the poster logo is never needed.
      omit: { logo: true },
    });
    if (!widget)
      return { ok: false as const, error: 'Unknown widget key', status: 404 };

    const [accountWide, cover] = await Promise.all([
      this.prisma.source.findMany({
        where: { userId: widget.userId, widgetId: null },
        select: { id: true, domain: true },
      }),
      this.billing.coverage(widget.userId),
    ]);
    const registered = [...widget.sources, ...accountWide];
    const allowed = registered.map((s) => s.domain);

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
    // Over the plan's limits (usually after a downgrade): paused, not gone.
    const { plan } = cover;
    if (!cover.widgets.has(widget.id)) {
      return {
        ok: false as const,
        error: `This widget is paused: the ${plan.name} plan includes ${plan.widgets} widget${plan.widgets === 1 ? '' : 's'}. Upgrade, or remove a widget in the dashboard.`,
        status: 402,
      };
    }
    const covered = registered.some(
      (s) => cover.sources.has(s.id) && hostMatches(host, [s.domain]),
    );
    if (!covered) {
      return {
        ok: false as const,
        error: `${host} is paused: the ${plan.name} plan includes ${plan.sources} domain${plan.sources === 1 ? '' : 's'}. Upgrade, or remove a domain under Sources.`,
        status: 402,
      };
    }

    return { ok: true as const, widget, host, plan };
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
    // Cross-origin answers need CORS. Refusals get it too: their reason is
    // not secret, and without it the script cannot read it - the owner would
    // see a bare CORS failure instead of "example.com is not allowed".
    const origin = (req.headers.origin as string) || '';
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');

    const resolved = await this.resolve(key, req);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const { widget, host, plan } = resolved;

    const settings = normalizeSettings(widget.settings);
    // A Pro design on an account that is no longer paid shows as Grid.
    if (
      settings.layout &&
      PRO_LAYOUTS.includes(settings.layout) &&
      !isPaidPlan(plan)
    ) {
      settings.layout = 'grid';
    }
    // So do transparent and custom backgrounds: the theme's own panel.
    if (!isPaidPlan(plan) && backgroundMode(settings) !== 'theme') {
      settings.background = 'theme';
      delete settings.backgroundColor;
    }
    const paid = isPaidPlan(plan);
    // Free widgets show the highest-rated reviews. On a paid one, data-sort
    // on the snippet may only pick one of the widget's own orders: "lowest
    // rated" would leave a 5-star-only widget empty.
    const order = widgetOrder(paid, settings, sort);
    // Only 5-star reviews are shown. Asking for just the allowance and then
    // filtering can leave one card, so take everything the engine has cached
    // for this place (no extra scrape) and cut to the allowance afterwards.
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

    // Every load of a shown widget is a view against the owner's monthly
    // allowance, and the plan decides how many reviews it shows.
    const usage = await this.billing.recordView(widget.userId, true, plan);
    if (!usage.allowed) {
      // Shown to the owner as visitors their widget missed.
      void this.analytics.record(widget.id, { missed: 1 });
      return res.status(402).json({
        error:
          'This widget has used its monthly views. The owner can upgrade to show it again.',
      });
    }

    void this.analytics.record(widget.id, { loads: 1, views: 1 });
    if (await this.seenDue(widget.id)) {
      // "Installed and live" in the dashboard.
      this.prisma.widget
        .update({
          where: { id: widget.id },
          data: { lastSeenAt: new Date(), lastSeenHost: host },
        })
        .catch(() => undefined);
    }

    // data-count on the snippet wins, then the widget's own setting; the plan
    // is the ceiling either way.
    // Never below zero: slice(0, -n) would hand out all but n reviews.
    const wanted =
      Math.max(0, Math.floor(Number(count)) || 0) || settings.reviewCount || 0;
    const shown = Math.min(wanted || usage.reviews, usage.reviews);
    const reviews = await pickReviews({
      reviews: result.reviews,
      order,
      paid,
      settings,
      want: shown,
      hide: (list) => this.hidden.filter(widget.placeId, list),
      highestRated: () => this.highestRated(widget.placeId, plan.refreshHours),
    });
    // The owner's filter words stay in the dashboard, not on their website.
    const publicSettings = { ...settings };
    delete publicSettings.excludeWords;
    delete publicSettings.includeWords;
    delete publicSettings.photosOnly;

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
        settings: publicSettings,
        // Google's own "leave a review" form for this place.
        writeReviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(widget.placeId)}`,
      },
      business: result.business,
      reviews,
      link: result.link,
      // Free widgets carry a small "Powered by" link; paid plans do not.
      branding: isPaidPlan(plan)
        ? null
        : { url: `${this.siteUrl()}/?ref=widget` },
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
