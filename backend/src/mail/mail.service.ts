import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { DEFAULT_FROM, PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';
import { appUrl, siteUrl } from '../common/urls';

// Brand colours, the same as the website.
const BRAND = '#E8446D';
const BRAND_FROM = '#FF6B6B';
const INK = '#1E293B';
const TEXT = '#334155';
const MUTED = '#94A3B8';
const WASH = '#FFF1F2';
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly site: string;
  private readonly app: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('SMTP_FROM') ?? DEFAULT_FROM;
    this.site = siteUrl(config);
    this.app = appUrl(config);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        // Keeps the connection open between emails instead of a new
        // connect + TLS + login each time.
        pool: true,
        // Nodemailer waits up to 2 minutes by default on a mail server that
        // does not answer; give up much sooner.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        'SMTP is not fully configured. Codes will be logged until you set SMTP_HOST, SMTP_USER and SMTP_PASS.',
      );
    }
  }

  async sendCode(
    email: string,
    code: string,
    purpose: 'login' | 'signup' | 'email',
  ) {
    const signup = purpose === 'signup';
    const subject =
      purpose === 'email'
        ? `Confirm your new email for ${PRODUCT_NAME}`
        : signup
          ? `Verify your ${PRODUCT_NAME} account`
          : `Your ${PRODUCT_NAME} login code`;
    const text =
      `Your ${PRODUCT_NAME} code is ${code}. It expires in 10 minutes.\n\n` +
      'If you did not ask for it, you can ignore this email - nobody can sign in without the code.';

    if (!this.transporter) {
      this.logger.warn(`DEV CODE for ${email} (${purpose}): ${code}`);
      return;
    }

    const body =
      paragraph(
        purpose === 'email'
          ? 'Enter this code in your account settings to confirm this as your new email address.'
          : signup
            ? 'Welcome! Enter this code to verify your email and finish creating your account.'
            : 'Enter this code to sign in to your account.',
      ) +
      `<div style="margin:24px 0;padding:20px 12px;border-radius:14px;background:${WASH};border:1px dashed #FDA4AF;text-align:center">` +
      `<div style="font:800 34px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:10px;color:${INK}">${escapeHtml(code)}</div>` +
      `<div style="margin-top:10px;font:13px/1.4 ${FONT};color:#64748B">Expires in 10 minutes</div></div>` +
      paragraph(
        'If you did not ask for this code, you can ignore this email - nobody can sign in without it.',
        MUTED,
        13,
      );

    await this.transporter.sendMail({
      from: this.from,
      // The sender is noreply; a customer's reply reaches support.
      replyTo: SUPPORT_EMAIL,
      to: email,
      subject,
      text,
      html: this.layout({
        preheader: `Your code is ${code}. It expires in 10 minutes.`,
        heading:
          purpose === 'email'
            ? 'Confirm your new email'
            : signup
              ? 'Verify your email'
              : 'Your login code',
        body,
      }),
    });
  }

  /**
   * Any transactional email. Never throws: a billing webhook or a widget view
   * must not fail because the mail server had a bad moment.
   *
   * The first line is the greeting ("Hi Sam,"), the rest the message; the
   * subject doubles as the heading.
   */
  async send(
    to: string,
    subject: string,
    lines: string[],
    cta?: { label: string; url: string },
  ) {
    const text = [
      ...lines,
      ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    ].join('\n');

    if (!this.transporter) {
      this.logger.warn(`DEV MAIL to ${to}: ${subject}`);
      return;
    }

    const body =
      lines.map((l) => paragraph(l)).join('') + (cta ? button(cta) : '');
    const html = this.layout({
      // The inbox preview line: the message itself, not "Hi Sam,".
      preheader: lines.slice(1).join(' ') || lines[0] || subject,
      heading: subject,
      body,
    });

    try {
      await this.transporter.sendMail({
        from: this.from,
        replyTo: SUPPORT_EMAIL,
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(
        `Mail to ${to} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * The frame every email shares: the wordmark, a white card with a brand
   * stripe, and a quiet footer. Tables and inline styles only, because that
   * is all Gmail, Outlook and phone mail apps agree on.
   */
  private layout(input: { preheader: string; heading: string; body: string }) {
    const year = new Date().getUTCFullYear();
    return (
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="color-scheme" content="light only"><title>${escapeHtml(input.heading)}</title></head>` +
      `<body style="margin:0;padding:0;background:#F4F5F7;-webkit-text-size-adjust:100%">` +
      // Hidden text some inboxes show next to the subject.
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(
        input.preheader.slice(0, 140),
      )}</div>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F5F7">` +
      `<tr><td align="center" style="padding:32px 16px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">` +
      // Wordmark
      `<tr><td style="padding:0 4px 18px">` +
      `<a href="${escapeHtml(this.site)}" style="text-decoration:none">` +
      // The mark as an image; with images off it is still a brand square.
      `<img src="${escapeHtml(this.site)}/brand/mark-128.png" width="32" height="32" alt="" ` +
      `style="display:inline-block;width:32px;height:32px;border:0;border-radius:9px;background:${BRAND};` +
      `background-image:linear-gradient(135deg,${BRAND_FROM},${BRAND});vertical-align:middle">` +
      `<span style="margin-left:10px;font:800 17px/32px ${FONT};color:${INK};vertical-align:middle;letter-spacing:-0.3px">` +
      `Widget<span style="color:${BRAND}">Pop</span></span>` +
      `</a></td></tr>` +
      // Card
      `<tr><td style="background:#FFFFFF;border:1px solid #E9EBF0;border-top:5px solid ${BRAND};border-radius:18px">` +
      `<div style="padding:30px 32px 30px">` +
      `<h1 style="margin:0 0 18px;font:800 22px/1.3 ${FONT};color:${INK};letter-spacing:-0.2px">${escapeHtml(input.heading)}</h1>` +
      input.body +
      `</div></td></tr>` +
      // Footer
      `<tr><td style="padding:22px 12px 8px;text-align:center;font:12px/1.7 ${FONT};color:${MUTED}">` +
      `You are getting this email because you have an account at ${PRODUCT_NAME}.<br>` +
      `Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};text-decoration:underline">${SUPPORT_EMAIL}</a>.<br>` +
      `<a href="${escapeHtml(this.app)}/dashboard" style="color:${MUTED};text-decoration:underline">Dashboard</a>` +
      ` &nbsp;&middot;&nbsp; ` +
      `<a href="${escapeHtml(this.app)}/dashboard/billing" style="color:${MUTED};text-decoration:underline">Billing</a>` +
      ` &nbsp;&middot;&nbsp; ` +
      `<a href="${escapeHtml(this.site)}/privacy" style="color:${MUTED};text-decoration:underline">Privacy</a>` +
      `<br>&copy; ${year} ${PRODUCT_NAME}` +
      `</td></tr></table></td></tr></table></body></html>`
    );
  }
}

function paragraph(text: string, color = TEXT, size = 15) {
  return `<p style="margin:0 0 14px;font:${size}px/1.65 ${FONT};color:${color}">${escapeHtml(text)}</p>`;
}

/** A button that still looks like one in Outlook: a padded table cell, not just a styled link. */
function button(cta: { label: string; url: string }) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px"><tr>` +
    `<td style="border-radius:12px;background:${BRAND};background-image:linear-gradient(135deg,${BRAND_FROM},${BRAND})">` +
    `<a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 26px;font:700 15px/1 ${FONT};` +
    `color:#FFFFFF;text-decoration:none;border-radius:12px">${escapeHtml(cta.label)} &rarr;</a>` +
    `</td></tr></table>` +
    `<p style="margin:14px 0 0;font:12px/1.6 ${FONT};color:${MUTED}">Button not working? Open this link:<br>` +
    `<a href="${escapeHtml(cta.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(cta.url)}</a></p>`
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
