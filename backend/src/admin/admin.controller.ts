import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminMfaGuard } from '../common/guards/admin-mfa.guard';
import { AdminAuditInterceptor } from '../common/interceptors/admin-audit.interceptor';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { HiddenReviewsService } from '../moderation/hidden-reviews.service';
import { MailService } from '../mail/mail.service';
import { BounceService } from '../mail/bounce.service';

@Controller('admin')
// Signed in, an admin, and a fresh authenticator-app code; every change logged.
@UseGuards(JwtAuthGuard, RolesGuard, AdminMfaGuard)
@UseInterceptors(AdminAuditInterceptor)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly hidden: HiddenReviewsService,
    private readonly mail: MailService,
    private readonly bounces: BounceService,
  ) {}

  // ---- email: is SMTP working, and what happened to each email
  @Get('email')
  async email() {
    return { ...(await this.mail.overview()), bounces: this.bounces.status() };
  }

  /** The mail server login, and the inbox read for bounces, right now. */
  @Post('email/check')
  async checkEmail() {
    const [smtp] = await Promise.all([this.mail.check(), this.bounces.check()]);
    return smtp;
  }

  @Post('email/test')
  testEmail(@Body() body: { to?: unknown }) {
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) {
      throw new BadRequestException(
        'Enter an email address to send the test to.',
      );
    }
    return this.mail.sendTest(to);
  }

  // ---- reviews a reviewer asked us to stop showing
  @Get('hidden-reviews')
  hiddenReviews() {
    return this.hidden.list();
  }

  @Post('hidden-reviews')
  hideReview(@Body() body: Record<string, unknown>) {
    return this.hidden.add(body ?? {});
  }

  @Delete('hidden-reviews/:id')
  unhideReview(@Param('id') id: string) {
    return this.hidden.remove(id);
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Get('widgets')
  widgets() {
    return this.admin.widgets();
  }

  @Get('sources')
  sources() {
    return this.admin.sources();
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.admin.deleteUser(me.id, id);
  }

  @Patch('users/:id/role')
  setRole(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { role?: unknown },
  ) {
    // Demoting yourself can leave the site with no admin at all.
    if (id === me.id && body?.role !== 'ADMIN') {
      throw new BadRequestException('You cannot remove your own admin role.');
    }
    return this.admin.setRole(id, body?.role);
  }
}
