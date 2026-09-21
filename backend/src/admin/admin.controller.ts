import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
