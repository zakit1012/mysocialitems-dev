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
const RESET_TTL = 10 * 60;
// A six digit code is a million guesses; without a cap the per-IP rate limit
// alone still lets a botnet walk through it inside the ten minute window.
const MAX_CODE_ATTEMPTS = 5;
// Codes go to whatever address is typed in. Without a cap per address,
// anyone could flood someone's inbox (or keep drawing fresh codes to guess).
const CODES_PER_HOUR = 5;
const CODE_GAP_SECONDS = 30;
/**
 * A bcrypt hash (same cost as real ones) of a random value nobody knows:
 * checked when an email has no account, so login takes the same time.
 */
const NO_ACCOUNT_HASH =
  '$2b$10$dvWP87O7OQKeQogxj7F8YOFUwREAJM0JDm1lE4Yrgg4ijXJqATViu';

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

  /**
   * The same answer whether or not the email already has an account, so
   * sign-up cannot be used to find out who is registered. An existing
   * account gets an email saying so (and how to log in) instead of a code.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    // Limits and the hash first, for every address alike: neither a 429
    // nor the time taken may tell the two apart.
    await this.guardSends(email);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const reply = {
      pending: true,
      email,
      message:
        'Check your email for a verification code. The account is not saved until you verify.',
    };

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      void this.mail
        .sendAccountExists(existing.email, existing.name)
        .catch(() => undefined);
      return reply;
    }

    const code = this.makeCode();
    const pending: SignupPending = {
      name: dto.name,
      email,
      passwordHash,
      role: dto.role ?? 'USER',
      code,
    };

    await this.redis.setJson(this.signupKey(email), pending, SIGNUP_TTL);
    await this.redis.del(`${this.signupKey(email)}:tries`);
    // In the background: the code screen shows at once instead of after the
    // mail server has answered. "Resend code" covers a lost email.
    this.sendInBackground(email, code, 'signup');
    return reply;
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
    void this.mail.sendTeam(
      `New sign-up: ${user.email}`,
      [
        'Hi team,',
        `${user.name} (${user.email}) just created a ${PRODUCT_NAME} account. They start on the Free plan.`,
      ],
      '/admin/users',
    );
    return { user, token: this.sign(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // A hash is checked either way, so the answer takes as long for an
    // unknown email as for a wrong password.
    const ok = await bcrypt.compare(
      dto.password,
      user?.password ?? NO_ACCOUNT_HASH,
    );
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user);
  }

  /**
   * The same answer whether or not the email has an account, so this form
   * cannot be used to find out who is signed up. No account: nothing is
   * stored or sent, and any code typed in is simply "invalid".
   */
  async sendLoginCode(emailRaw: string) {
    const email = emailRaw.toLowerCase();
    // Limits first, for every address alike: a 429 must not tell them apart.
    await this.guardSends(email);
    const sent = {
      pending: true,
      email,
      message:
        'If an account exists for this email, we sent a login code to it.',
    };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return sent;

    const code = this.makeCode();
    await this.redis.setJson(
      this.loginKey(email),
      { code } satisfies LoginPending,
      LOGIN_TTL,
    );
    await this.redis.del(`${this.loginKey(email)}:tries`);
    this.sendInBackground(email, code, 'login');
    return sent;
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
      // Deleted after the code was sent.
      throw new UnauthorizedException('Invalid or expired login code');
    }

    await this.redis.del(this.loginKey(email));
    await this.redis.del(`${this.loginKey(email)}:tries`);
    return this.issue(user);
  }

  private sendInBackground(
    email: string,
    code: string,
    purpose: 'signup' | 'login' | 'password',
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

  /**
   * Burns the pending code after too many wrong guesses. A 429, not a 401:
   * on the account page a 401 would sign the user out.
   */
  private async guardAttempts(codeKey: string, ttl: number) {
    const tries = await this.redis.incrWithTtl(`${codeKey}:tries`, ttl);
    if (tries > MAX_CODE_ATTEMPTS) {
      await this.redis.del(codeKey);
      throw new HttpException(
        'Too many wrong codes. Request a new one.',
        HttpStatus.TOO_MANY_REQUESTS,
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
      // A password change bumps this, signing out older tokens.
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
    return this.setPassword(userId, next);
  }

  /** Forgot the current password: a code goes to the account's own email. */
  async sendPasswordResetCode(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    await this.guardSends(user.email);
    const code = this.makeCode();
    await this.redis.setJson(
      this.passwordResetKey(userId),
      { code },
      RESET_TTL,
    );
    await this.redis.del(`${this.passwordResetKey(userId)}:tries`);
    this.sendInBackground(user.email, code, 'password');
    return { pending: true, email: user.email };
  }

  /** The emailed code stands in for the current password. */
  async resetPassword(userId: string, code: string, next: string) {
    const key = this.passwordResetKey(userId);
    await this.guardAttempts(key, RESET_TTL);
    const pending = await this.redis.getJson<{ code: string }>(key);
    if (!pending || pending.code !== code) {
      throw new BadRequestException('Invalid or expired code');
    }
    const session = await this.setPassword(userId, next);
    await this.redis.del(key);
    await this.redis.del(`${key}:tries`);
    return session;
  }

  /** Saves a new password; every other device is signed out, this one gets a new token. */
  private async setPassword(userId: string, next: string) {
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
      `If this was not you, sign in with "Email code" on the login page, choose "Forgot your current password?" under Account to set a new one, and write to ${SUPPORT_EMAIL}.`,
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

  private passwordResetKey(userId: string) {
    return `password-reset:${userId}`;
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
