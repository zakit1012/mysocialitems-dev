import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlacesService } from './places.service';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly engine: ReviewsEngineService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Reviews for a place the signed-in user is looking at, before a widget
   * exists. Not domain-locked: the caller is authenticated, and this is the
   * preview in our own dashboard, not an embed on someone's site.
   */
  @Get('reviews')
  async reviews(
    @CurrentUser() user: AuthUser,
    @Query('placeId') placeId: string,
    @Query('count') count?: string,
    @Query('sort') sort?: string,
  ) {
    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }
    // Up to the plan's allowance, or 10 so a Free user sees what an upgrade adds.
    const plan = await this.billing.planFor(user.id);
    const max = Math.max(10, plan.reviews);
    return this.engine.fetch(
      placeId,
      Math.min(Math.max(Number(count) || 6, 1), max),
      sort || 'mostRelevant',
    );
  }

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteDto) {
    return this.places.autocomplete(query.q, query.sessionToken);
  }

  @Get('details')
  details(
    @Query('placeId') placeId: string,
    @Query('sessionToken') sessionToken?: string,
  ) {
    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }
    return this.places.details(placeId, sessionToken);
  }
}
