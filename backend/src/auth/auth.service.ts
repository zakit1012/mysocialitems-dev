import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const code = this.makeCode();
    const pending: SignupPending = {
      name: dto.name,
      email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: dto.role ?? 'USER',
      code,
    };

    await this.redis.setJson(this.signupKey(email), pending, SIGNUP_TTL);
    await this.mail.sendCode(email, code, 'signup');

    return {
      pending: true,
      email,
      message: 'Check your email for a verification code. The account is not saved until you verify.',
    };
  }

  async verifySignup(emailRaw: string, code: string) {
    const email = emailRaw.toLowerCase();
    const pending = await this.redis.getJson<SignupPending>(this.signupKey(email));
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

    const code = this.makeCode();
    await this.redis.setJson(this.loginKey(email), { code } satisfies LoginPending, LOGIN_TTL);
    await this.mail.sendCode(email, code, 'login');

    return {
      pending: true,
      email,
      message: 'We sent a login code to your email.',
    };
  }

  async verifyLoginCode(emailRaw: string, code: string) {
    const email = emailRaw.toLowerCase();
    const pending = await this.redis.getJson<LoginPending>(this.loginKey(email));
    if (!pending || pending.code !== code) {
      throw new UnauthorizedException('Invalid or expired login code');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }

    await this.redis.del(this.loginKey(email));
    return this.issue(user);
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
