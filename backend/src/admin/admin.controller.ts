import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
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
  setRole(@Param('id') id: string, @Body() body: { role: string }) {
    return this.admin.setRole(id, body.role);
  }
}
