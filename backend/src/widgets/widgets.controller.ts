import { Body, Controller, Get, Post, Patch, Delete, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('widgets')
@UseGuards(JwtAuthGuard)
export class WidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.widgets.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWidgetDto) {
    return this.widgets.create(user.id, dto);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const widget = await this.widgets.get(user.id, id);
    if (!widget) throw new NotFoundException();
    return widget;
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWidgetDto) {
    return this.widgets.update(user.id, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.widgets.delete(user.id, id);
  }
}
