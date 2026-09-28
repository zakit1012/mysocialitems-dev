import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BusinessesService } from './businesses.service';

const GONE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review link not found</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1f2937">
<h1 style="font-size:1.25rem">This review link is not active</h1>
<p>The business may have removed it. Search for the business on Google Maps to leave a review there.</p>
</body>`;

/**
 * The short review link in QR codes and shared messages
 * (widgetpop.com/r/abc1234, which the site forwards here): counts the open
 * and sends the customer on to the business's Google review form.
 */
@Controller('r')
export class ReviewLinksController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get(':slug')
  async open(
    @Param('slug') slug: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() res: Response,
  ) {
    const url = await this.businesses.open(slug, userAgent);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!url) {
      res.status(404).type('html').send(GONE);
      return;
    }
    res.redirect(302, url);
  }
}
