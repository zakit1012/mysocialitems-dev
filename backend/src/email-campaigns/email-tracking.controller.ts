import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';
import { BRAND, FONT, INK, TEXT, escapeHtml } from '../mail/brand';
import { EmailCampaignsService } from './email-campaigns.service';

/** A transparent 1x1 GIF. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function page(title: string, body: string) {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${escapeHtml(title)} - ${PRODUCT_NAME}</title></head>` +
    `<body style="margin:0;background:#F4F5F7;font:16px/1.6 ${FONT};color:${TEXT}">` +
    `<main style="max-width:30rem;margin:12vh auto;padding:32px;background:#fff;border:1px solid #E9EBF0;` +
    `border-top:5px solid ${BRAND};border-radius:18px">` +
    `<h1 style="margin:0 0 12px;font-size:1.3rem;color:${INK}">${escapeHtml(title)}</h1>${body}</main></body></html>`
  );
}

const BUTTON = `display:inline-block;margin-top:8px;padding:12px 22px;border:0;border-radius:12px;background:${BRAND};color:#fff;font:700 15px ${FONT};cursor:pointer`;

/**
 * What campaign emails link to: the image that counts an open, and the
 * unsubscribe page. No sign-in, and no rate limit: a mail provider's image
 * proxy loads many opens from one address.
 */
@Controller('e')
@SkipThrottle()
export class EmailTrackingController {
  constructor(private readonly campaigns: EmailCampaignsService) {}

  @Get('o/:token')
  async open(@Param('token') token: string, @Res() res: Response) {
    await this.campaigns
      .recordOpen(token.replace(/\.gif$/i, ''))
      .catch(() => undefined);
    res
      .status(200)
      .set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex',
      })
      .send(PIXEL);
  }

  /**
   * Asks first rather than unsubscribing on the visit itself: link checkers
   * in mail filters open every link, and must not unsubscribe anyone.
   */
  @Get('u/:token')
  async unsubscribePage(@Param('token') token: string, @Res() res: Response) {
    res.set('Cache-Control', 'no-store').type('html');
    if (token === 'test') {
      res.send(
        page(
          'Unsubscribe',
          '<p>This is a test email, so this link does nothing. In a real campaign it takes the address off the mailing list.</p>',
        ),
      );
      return;
    }
    const email = await this.campaigns.tokenEmail(token);
    if (!email) {
      res
        .status(404)
        .send(
          page('Link not found', '<p>This unsubscribe link is not valid.</p>'),
        );
      return;
    }
    res.send(
      page(
        'Unsubscribe?',
        `<p>Stop sending ${PRODUCT_NAME} news and updates to <b>${escapeHtml(email)}</b>?</p>` +
          `<form method="post"><button type="submit" style="${BUTTON}">Unsubscribe</button></form>` +
          `<p style="margin-top:20px;font-size:14px">Emails about your account (sign-in codes, billing) still arrive.</p>`,
      ),
    );
  }

  /** The button above, and mail apps' one-click unsubscribe (RFC 8058). */
  @Post('u/:token')
  async unsubscribe(@Param('token') token: string, @Res() res: Response) {
    res.set('Cache-Control', 'no-store').type('html');
    const email =
      token === 'test' ? null : await this.campaigns.unsubscribe(token);
    if (!email) {
      res
        .status(404)
        .send(
          page('Link not found', '<p>This unsubscribe link is not valid.</p>'),
        );
      return;
    }
    res.send(
      page(
        'You are unsubscribed',
        `<p><b>${escapeHtml(email)}</b> will not get ${PRODUCT_NAME} news and updates any more.</p>` +
          `<p style="font-size:14px">Changed your mind? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND}">${SUPPORT_EMAIL}</a>.</p>`,
      ),
    );
  }
}
