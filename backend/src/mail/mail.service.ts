import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from =
      config.get<string>('SMTP_FROM') ??
      'My Social Items <noreply@mysocialitems.local>';

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

  async sendCode(email: string, code: string, purpose: 'login' | 'signup') {
    const subject =
      purpose === 'login'
        ? 'Your My Social Items login code'
        : 'Verify your My Social Items account';
    const text = `Your My Social Items code is ${code}. It expires in 10 minutes.`;

    if (!this.transporter) {
      this.logger.warn(`DEV CODE for ${email} (${purpose}): ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text,
      html: `<p>Your My Social Items code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  }

  /**
   * Any transactional email. Never throws: a billing webhook or a widget view
   * must not fail because the mail server had a bad moment.
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
    const html =
      `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px">` +
      lines
        .map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`)
        .join('') +
      (cta
        ? `<p style="margin:20px 0"><a href="${cta.url}" style="background:#e8446d;color:#fff;` +
          `padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
        : '') +
      `<p style="margin-top:24px;color:#a1a1aa;font-size:12px">My Social Items</p></div>`;

    if (!this.transporter) {
      this.logger.warn(`DEV MAIL to ${to}: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
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
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
