import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

const RANGES = [7, 30, 90];

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const range = RANGES.includes(Number(days)) ? Number(days) : 30;
    return this.analytics.overview(user.id, range);
  }
}
