import {
  ConflictException,
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
    purpose: 'signup' | 'login',
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

  private issue(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    city: string | null;
    createdAt: Date;
  }) {
    const safe = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      city: user.city,
      createdAt: user.createdAt,
    };
    return { user: safe, token: this.sign(safe) };
  }

  private sign(user: { id: string; email: string; role: string }) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
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
