import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  ProfileDto,
  ResetPasswordDto,
} from './dto/account.dto';

/**
 * The signed-in user's own account: name, password, deletion. The email is
 * fixed for good - it is who the account (and its billing) belongs to.
 */
@Controller('account')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AccountController {
  constructor(private readonly auth: AuthService) {}

  @Patch('profile')
  profile(@CurrentUser() user: AuthUser, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(user.id, dto.name);
  }

  /** Signs out every other device; answers with a fresh token for this one. */
  @Post('password')
  password(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /** Forgot the current password: sends a code to the account's email. */
  @Post('password/code')
  passwordCode(@CurrentUser() user: AuthUser) {
    return this.auth.sendPasswordResetCode(user.id);
  }

  /** The code instead of the current password; same sign-outs as a change. */
  @Post('password/reset')
  resetPassword(@CurrentUser() user: AuthUser, @Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(user.id, dto.code, dto.newPassword);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(user.id, dto.password);
  }
}
