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
      config.get<string>('SMTP_FROM') ?? 'SocialDeal <noreply@socialdeal.local>';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
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
        ? 'Your SocialDeal login code'
        : 'Verify your SocialDeal account';
    const text = `Your SocialDeal code is ${code}. It expires in 10 minutes.`;

    if (!this.transporter) {
      this.logger.warn(`DEV CODE for ${email} (${purpose}): ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text,
      html: `<p>Your SocialDeal code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  }
}
