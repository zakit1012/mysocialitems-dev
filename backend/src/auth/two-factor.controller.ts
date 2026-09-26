import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { TwoFactorService } from './two-factor.service';
import { TotpCodeDto } from './dto/totp-code.dto';

/** 2-step sign-in for admins: set up the authenticator app, then use it. */
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.twoFactor.status(user.id, user.mfaUntil);
  }

  @Post('setup')
  setup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.setup(user.id);
  }

  @Post('enable')
  enable(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.enable(user.id, dto.code, req.ip ?? '');
  }

  @Post('verify')
  verify(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.verify(user.id, dto.code, req.ip ?? '');
  }
}
