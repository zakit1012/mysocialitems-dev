import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';
import { AuthService } from './auth.service';
import { newTotpSecret, totpUri, verifyTotp } from './totp';

/** How long one authenticator-app check opens the admin panel. */
const MFA_HOURS = 12;
/** Wrong codes allowed per account before a pause. */
const MAX_TRIES = 5;
const LOCK_SECONDS = 15 * 60;

/**
 * Two-step sign-in for the admin panel: after the password (or email code),
 * a 6-digit code from an authenticator app. Admin API calls are refused
 * without it (AdminMfaGuard).
 */
@Injectable()
export class TwoFactorService {
  private readonly log = new Logger('AdminAudit');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  async status(userId: string, mfaUntil?: number) {
    const user = await this.load(userId);
    return {
      enabled: Boolean(user.totpEnabledAt),
      verified: Boolean(mfaUntil && mfaUntil * 1000 > Date.now()),
    };
  }

  /** A new secret for the app to scan. Only until the first code checks out. */
  async setup(userId: string) {
    const user = await this.load(userId);
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        '2-step sign-in is already on for this account.',
      );
    }
    const secret = newTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: this.settings.seal(secret),
        totpLastStep: null,
      },
    });
    return { secret, uri: totpUri(secret, user.email, PRODUCT_NAME) };
  }

  /** The first code from the app: turns 2-step sign-in on. */
  async enable(userId: string, code: string, ip: string) {
    const user = await this.load(userId);
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        '2-step sign-in is already on for this account.',
      );
    }
    const step = await this.check(user, code, ip);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { totpEnabledAt: new Date(), totpLastStep: step },
    });
    this.log.log(`${user.email} turned on 2-step sign-in from ${ip}`);
    void this.mail.send(
      user.email,
      '2-step sign-in is on for your admin account',
      [
        `Hi ${user.name},`,
        `The admin panel of ${PRODUCT_NAME} now asks for a code from your authenticator app after your password.`,
        `If this was not you, write to ${SUPPORT_EMAIL} straight away.`,
      ],
    );
    return this.auth.issue(updated, this.until());
  }

  /** A code from the app: opens the admin panel for MFA_HOURS. */
  async verify(userId: string, code: string, ip: string) {
    const user = await this.load(userId);
    if (!user.totpEnabledAt) {
      throw new BadRequestException('Set up 2-step sign-in first.');
    }
    const step = await this.check(user, code, ip);
    // Only if no newer code was used meanwhile: a code works once, even
    // when two requests race.
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    // 400, not 401: the sign-in is fine, and a 401 signs the app out.
    if (!count) throw new BadRequestException('That code was already used.');
    this.log.log(`${user.email} opened the admin panel from ${ip}`);
    return this.auth.issue(user, this.until());
  }

  private until() {
    return Math.floor(Date.now() / 1000) + MFA_HOURS * 3600;
  }

  private async load(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** The step of a right code; counts and pauses wrong ones. */
  private async check(
    user: {
      id: string;
      email: string;
      totpSecret: string | null;
      totpLastStep: number | null;
    },
    code: string,
    ip: string,
  ): Promise<number> {
    const triesKey = `2fa-tries:${user.id}`;
    const tries = await this.redis.incrWithTtl(triesKey, LOCK_SECONDS);
    if (tries > MAX_TRIES) {
      this.log.warn(
        `${user.email}: 2-step code locked after wrong tries (${ip})`,
      );
      throw new HttpException(
        'Too many wrong codes. Wait 15 minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const secret = user.totpSecret
      ? this.settings.unseal(user.totpSecret)
      : null;
    if (!secret) {
      throw new BadRequestException(
        '2-step sign-in is not set up. Ask for a reset on the server.',
      );
    }
    const step = verifyTotp(secret, code.trim(), user.totpLastStep);
    if (step === null) {
      this.log.warn(`${user.email}: wrong 2-step code from ${ip}`);
      throw new BadRequestException(
        'That code is not right. Use the newest code in your app.',
      );
    }
    await this.redis.del(triesKey);
    return step;
  }
}
