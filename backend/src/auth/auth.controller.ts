import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailDto } from './dto/email.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register/verify')
  verifySignup(@Body() dto: VerifyCodeDto) {
    return this.auth.verifySignup(dto.email, dto.code);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login-code')
  sendLoginCode(@Body() dto: EmailDto) {
    return this.auth.sendLoginCode(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login-code/verify')
  verifyLoginCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyLoginCode(dto.email, dto.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /**
   * A fresh 7-day token for a signed-in user. The app asks on every visit, so
   * someone who keeps using it stays signed in; 7 days away signs them out.
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  refresh(@CurrentUser() user: AuthUser) {
    return this.auth.refresh(user.id);
  }
}
