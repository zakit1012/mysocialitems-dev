import { Controller, Get, Header, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { hostFrom, hostMatches } from '../sources/domain.util';
import { widgetScript } from './widget-script';

/**
 * The only endpoints a customer's website talks to. No auth token here - the
 * widget's public key identifies it, and the caller's Origin has to be a
 * domain the owner registered. Copying the snippet to another site gets a 403.
 */
@Controller('embed')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ReviewsEngineService,
  ) {}

  private originOf(req: Request): string | null {
    return hostFrom(
      (req.headers.origin as string) || (req.headers.referer as string),
    );
  }

  private async resolve(key: string, req: Request) {
    const widget = await this.prisma.widget.findUnique({
      where: { publicKey: key },
      include: { sources: { select: { domain: true } } },
    });
    if (!widget) return { ok: false as const, error: 'Unknown widget key', status: 404 };

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
        error: 'No Origin header - embed this on a web page, not a direct call.',
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
  async script(@Query('key') key: string, @Res() res: Response) {
    res.send(widgetScript(key ?? ''));
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

    const result = await this.engine.fetch(
      widget.placeId,
      Math.min(Number(count ?? 5) || 5, 50),
      sort || 'mostRelevant',
    );

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
        settings: widget.settings ?? {},
      },
      business: result.business,
      reviews: result.reviews,
      link: result.link,
      took_ms: result.took_ms,
      error: result.error,
    });
  }
}
