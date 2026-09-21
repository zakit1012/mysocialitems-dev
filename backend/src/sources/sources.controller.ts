import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { SourcesService } from './sources.service';

@Controller('sources')
@UseGuards(JwtAuthGuard)
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sources.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { domain: string; widgetId?: string },
  ) {
    return this.sources.create(user.id, body.domain, body.widgetId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sources.remove(user.id, id);
  }
}
