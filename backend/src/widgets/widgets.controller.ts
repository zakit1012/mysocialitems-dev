import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { WIDGET_GONE, WidgetsService } from './widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { isPaidPlan } from '../billing/plans';
import { MAX_REVIEW_COUNT, normalizeSettings } from './widget-settings';
import {
  FREE_PREVIEW_REVIEWS,
  HIGHEST_RATED,
  pickReviews,
  widgetOrder,
} from './review-picker';
import { HiddenReviewsService } from '../moderation/hidden-reviews.service';

@Controller('widgets')
@UseGuards(JwtAuthGuard)
export class WidgetsController {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly engine: ReviewsEngineService,
    private readonly billing: BillingService,
    private readonly hidden: HiddenReviewsService,
  ) {}

  /** The owner's own preview. Skips the domain lock that the public embed applies. */
  @Get(':id/reviews')
  async reviews(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('sort') sort?: string,
  ) {
    const widget = await this.widgets.get(user.id, id);
    if (!widget) throw new NotFoundException(WIDGET_GONE);
    const plan = await this.billing.planFor(user.id);
    const paid = isPaidPlan(plan);
    const settings = normalizeSettings(widget.settings);
    const order = widgetOrder(paid, settings, sort);
    // The full allowance of 5-star reviews, like the embed: everything the
    // engine has cached, filtered and topped up, then cut to the plan. The
    // editor applies the count itself so every change previews instantly.
    // One request waits for a real answer instead of the dashboard polling.
    const result = await this.engine.fetchAndWait(
      widget.placeId,
      MAX_REVIEW_COUNT,
      order,
    );
    await this.widgets.syncName(user.id, id, result.business?.name);
    const reviews = result.error
      ? []
      : await pickReviews({
          reviews: result.reviews,
          order,
          paid,
          settings,
          // Free owners see what an upgrade adds; their site shows the plan's.
          want: paid
            ? plan.reviews
            : Math.max(plan.reviews, FREE_PREVIEW_REVIEWS),
          hide: (list) => this.hidden.filter(widget.placeId, list),
          // One try at the engine, so the editor is not held up by a cold place.
          highestRated: async () => {
            const more = await this.engine.fetch(
              widget.placeId,
              MAX_REVIEW_COUNT,
              HIGHEST_RATED,
            );
            return more.served !== 'fetching' && !more.error
              ? more.reviews
              : [];
          },
        });
    return { ...result, reviews };
  }

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
    if (!widget) throw new NotFoundException(WIDGET_GONE);
    return this.widgets.asShown(user.id, widget);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.widgets.update(user.id, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.widgets.delete(user.id, id);
  }
}
