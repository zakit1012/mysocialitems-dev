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
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { HiddenReviewsService } from '../moderation/hidden-reviews.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly hidden: HiddenReviewsService,
  ) {}

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
