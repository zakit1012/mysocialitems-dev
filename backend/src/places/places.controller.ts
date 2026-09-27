import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PlacesService } from './places.service';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { MAX_REVIEW_COUNT, fiveStarOnly } from '../widgets/widget-settings';
import { HiddenReviewsService } from '../moderation/hidden-reviews.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

// Every place the engine has not seen is a paid scrape. Looking at a few
// dozen a day is plenty for choosing a business; a script is not.
const NEW_PLACES_PER_DAY = 25;

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly engine: ReviewsEngineService,
    private readonly billing: BillingService,
    private readonly hidden: HiddenReviewsService,
    private readonly redis: RedisService,
  ) {}

  /** Counts each place an account looks up once a day, and stops past the cap. */
  private async guardNewPlace(user: AuthUser, placeId: string) {
    if (user.role === 'ADMIN') return;
    const fresh = await this.redis
      .setIfAbsent(`place-look:${user.id}:${placeId}`, 86_400)
      .catch(() => false);
    if (!fresh) return;
    const day = new Date().toISOString().slice(0, 10);
    const n = await this.redis
      .incrWithTtl(`place-looks:${user.id}:${day}`, 86_400)
      .catch(() => 0);
    if (n > NEW_PLACES_PER_DAY) {
      throw new HttpException(
        'You have looked up a lot of places today. Please try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

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
    await this.guardNewPlace(user, placeId);
    // Up to the plan's allowance, or 10 so a Free user sees what an upgrade adds.
    const plan = await this.billing.planFor(user.id);
    const max = Math.max(10, plan.reviews);
    // The dashboard is already showing an "importing" spinner for this call,
    // so it is fine for the one request to wait instead of the browser
    // polling several - see fetchAndWait's own doc for why this must never
    // be used on the public embed.
    const wanted = Math.min(Math.max(Number(count) || 6, 1), max);
    // 5-star only, like the embed: filter everything the engine has cached
    // for this place first, so the filter does not leave a single card.
    const result = await this.engine.fetchAndWait(
      placeId,
      MAX_REVIEW_COUNT,
      sort || 'mostRelevant',
    );
    return {
      ...result,
      reviews: (
        await this.hidden.filter(placeId, fiveStarOnly(result.reviews))
      ).slice(0, wanted),
    };
  }

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteDto) {
    return this.places.autocomplete(query.q, query.sessionToken);
  }

  /** A maps.app.goo.gl share link, opened to the Google Maps address it stands for. */
  @Get('resolve-link')
  resolveLink(@Query('url') url?: string) {
    if (!url || url.length > 500) {
      throw new BadRequestException('url is required');
    }
    return this.places.resolveShortLink(url);
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
