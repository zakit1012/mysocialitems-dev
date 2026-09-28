import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { BusinessesService } from './businesses.service';

/** The signed-in account's businesses, for the review tools (Get reviews). */
@Controller('businesses')
@UseGuards(JwtAuthGuard)
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.businesses.list(user.id);
  }

  @Put(':id/logo')
  setLogo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { logo?: unknown },
  ) {
    return this.businesses.setLogo(user.id, id, body?.logo ?? null);
  }

  @Put(':id/poster-color')
  setPosterColor(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { color?: unknown },
  ) {
    return this.businesses.setPosterColor(user.id, id, body?.color ?? null);
  }
}
