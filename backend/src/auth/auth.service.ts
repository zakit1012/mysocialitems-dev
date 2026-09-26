import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BillingService } from '../billing/billing.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PRODUCT_NAME, SUPPORT_EMAIL } from '../common/product';

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  city: true,
  createdAt: true,
};

type SignupPending = {
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  code: string;
};

type LoginPending = {
  code: string;
};

const SIGNUP_TTL = 15 * 60;
const LOGIN_TTL = 10 * 60;
// A six digit code is a million guesses; without a cap the per-IP rate limit
// alone still lets a botnet walk through it inside the ten minute window.
const MAX_CODE_ATTEMPTS = 5;
// Codes go to whatever address is typed in. Without a cap per address,
// anyone could flood someone's inbox (or keep drawing fresh codes to guess).
const CODES_PER_HOUR = 5;
const CODE_GAP_SECONDS = 30;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    await this.guardSends(email);
    const code = this.makeCode();
    const pending: SignupPending = {
      name: dto.name,
      email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: dto.role ?? 'USER',
      code,
    };

    await this.redis.setJson(this.signupKey(email), pending, SIGNUP_TTL);
    await this.redis.del(`${this.signupKey(email)}:tries`);
    // In the background: the code screen shows at once instead of after the
    // mail server has answered. "Resend code" covers a lost email.
    this.sendInBackground(email, code, 'signup');

    return {
      pending: true,
      email,
      message:
        'Check your email for a verification code. The account is not saved until you verify.',
    };
  }

  async verifySignup(emailRaw: string, code: string) {
    const email = emailRaw.toLowerCase();
    await this.guardAttempts(this.signupKey(email), SIGNUP_TTL);
    const pending = await this.redis.getJson<SignupPending>(
      this.signupKey(email),
    );
    if (!pending || pending.code !== code) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      await this.redis.del(this.signupKey(email));
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: pending.email,
        password: pending.passwordHash,
        name: pending.name,
        role: pending.role,
      },
      select: publicUser,
    });

    await this.redis.del(this.signupKey(email));
    await this.redis.del(`${this.signupKey(email)}:tries`);
    // New accounts start on Free. The welcome email is best effort and goes
    // out in the background, so creating the account never waits on it.
    await this.billing.subscriptionFor(user.id);
    void this.billing.welcome(user.id).catch(() => undefined);
    return { user, token: this.sign(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user);
  }

  async sendLoginCode(emailRaw: string) {
    const email = emailRaw.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }

    await this.guardSends(email);
    const code = this.makeCode();
    await this.redis.setJson(
      this.loginKey(email),
      { code } satisfies LoginPending,
      LOGIN_TTL,
    );
    await this.redis.del(`${this.loginKey(email)}:tries`);
    this.sendInBackground(email, code, 'login');

    return {
      pending: true,
      email,
      message: 'We sent a login code to your email.',
    };
  }

  async verifyLoginCode(emailRaw: string, code: string) {
    const email = emailRaw.toLowerCase();
    await this.guardAttempts(this.loginKey(email), LOGIN_TTL);
    const pending = await this.redis.getJson<LoginPending>(
      this.loginKey(email),
    );
    if (!pending || pending.code !== code) {
      throw new UnauthorizedException('Invalid or expired login code');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }

    await this.redis.del(this.loginKey(email));
    await this.redis.del(`${this.loginKey(email)}:tries`);
    return this.issue(user);
  }

  private sendInBackground(
    email: string,
    code: string,
    purpose: 'signup' | 'login' | 'email',
  ) {
    void this.mail
      .sendCode(email, code, purpose)
      .catch((err: unknown) =>
        this.log.error(
          `Could not send the ${purpose} code to ${email}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /** A short gap between codes to one address, and a few an hour at most. */
  private async guardSends(email: string) {
    if (
      !(await this.redis.setIfAbsent(`code-gap:${email}`, CODE_GAP_SECONDS))
    ) {
      throw new HttpException(
        'A code was just sent. Wait a few seconds before asking for another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      (await this.redis.incrWithTtl(`code-sends:${email}`, 3600)) >
      CODES_PER_HOUR
    ) {
      throw new HttpException(
        'Too many codes for this email. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Burns the pending code after too many wrong guesses. */
  private async guardAttempts(codeKey: string, ttl: number) {
    const tries = await this.redis.incrWithTtl(`${codeKey}:tries`, ttl);
    if (tries > MAX_CODE_ATTEMPTS) {
      await this.redis.del(codeKey);
      throw new UnauthorizedException(
        'Too many wrong codes. Request a new one.',
      );
    }
  }

  /**
   * A new token for a signed-in user. An admin's 2-step check carries over
   * until it runs out; it is never extended here.
   */
  async refresh(userId: string, mfaUntil?: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const stillValid = mfaUntil && mfaUntil * 1000 > Date.now();
    return this.issue(user, stillValid ? mfaUntil : undefined);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUser,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  issue(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      city: string | null;
      createdAt: Date;
      tokenVersion?: number;
    },
    mfaUntil?: number,
  ) {
    const safe = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      city: user.city,
      createdAt: user.createdAt,
    };
    return {
      user: safe,
      token: this.sign({ ...safe, tokenVersion: user.tokenVersion }, mfaUntil),
    };
  }

  private sign(
    user: {
      id: string;
      email: string;
      role: string;
      tokenVersion?: number;
    },
    mfaUntil?: number,
  ) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      // A password or email change bumps this, signing out older tokens.
      v: user.tokenVersion ?? 0,
      // Admins only: the authenticator-app check passed, good until then.
      ...(mfaUntil ? { mfa: mfaUntil } : {}),
    });
  }

  // ------------------------------------------------------------ account

  async updateProfile(userId: string, nameRaw: string) {
    const name = nameRaw.trim();
    if (name.length < 2) {
      throw new BadRequestException('Your name needs at least 2 characters.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: publicUser,
    });
  }

  /** New password; every other device is signed out, this one gets a new token. */
  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(current, user.password))) {
      throw new BadRequestException('Your current password is not right.');
    }
    if (current === next) {
      throw new BadRequestException(
        'Choose a new password, different from the current one.',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(next, 10),
        tokenVersion: { increment: 1 },
      },
    });
    void this.mail.send(updated.email, 'Your password was changed', [
      `Hi ${updated.name},`,
      `The password for your ${PRODUCT_NAME} account was just changed, and every other device was signed out.`,
      `If this was not you, sign in with "Email code" on the login page, set a new password, and write to ${SUPPORT_EMAIL}.`,
    ]);
    return this.issue(updated);
  }

  /** Step 1 of an email change: a code goes to the new address. */
  async requestEmailChange(userId: string, emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Your password is not right.');
    }
    if (email === user.email) {
      throw new BadRequestException('That is already your email.');
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    await this.guardSends(email);
    const code = this.makeCode();
    await this.redis.setJson(
      this.emailChangeKey(userId),
      { email, code },
      SIGNUP_TTL,
    );
    await this.redis.del(`${this.emailChangeKey(userId)}:tries`);
    this.sendInBackground(email, code, 'email');
    return { pending: true, email };
  }

  /** Step 2: the code proves the new address is theirs. */
  async verifyEmailChange(userId: string, code: string) {
    const key = this.emailChangeKey(userId);
    await this.guardAttempts(key, SIGNUP_TTL);
    const pending = await this.redis.getJson<{ email: string; code: string }>(
      key,
    );
    if (!pending || pending.code !== code) {
      throw new BadRequestException('Invalid or expired code');
    }
    if (
      await this.prisma.user.findUnique({ where: { email: pending.email } })
    ) {
      await this.redis.del(key);
      throw new ConflictException('An account with this email already exists');
    }
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new UnauthorizedException();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: pending.email, tokenVersion: { increment: 1 } },
    });
    await this.redis.del(key);
    await this.redis.del(`${key}:tries`);
    // The old address hears about it, in case this was not its owner.
    void this.mail.send(before.email, 'Your email was changed', [
      `Hi ${updated.name},`,
      `The email for your ${PRODUCT_NAME} account is now ${updated.email}. If this was not you, write to ${SUPPORT_EMAIL} straight away.`,
    ]);
    return this.issue(updated);
  }

  /**
   * Deletes the account and everything in it (widgets, domains, settings).
   * A running subscription is cancelled first, so nothing is charged again;
   * payment records stay, without the account, for the books.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.role === 'ADMIN') {
      throw new ForbiddenException(
        'Admin accounts cannot be deleted here. Make another account admin first, then remove the role.',
      );
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Your password is not right.');
    }
    await this.billing.closeForDeletion(userId);
    await this.prisma.user.delete({ where: { id: userId } });
    void this.mail.send(user.email, 'Your account is deleted', [
      `Hi ${user.name},`,
      `Your ${PRODUCT_NAME} account, widgets and settings are deleted, and any subscription is cancelled - you will not be charged again. Your widgets no longer show on your website.`,
      `Thank you for trying ${PRODUCT_NAME}.`,
    ]);
    return { ok: true };
  }

  private emailChangeKey(userId: string) {
    return `email-change:${userId}`;
  }

  private makeCode() {
    return String(randomInt(100000, 1000000));
  }

  private signupKey(email: string) {
    return `signup:${email}`;
  }

  private loginKey(email: string) {
    return `login-code:${email}`;
  }
}
