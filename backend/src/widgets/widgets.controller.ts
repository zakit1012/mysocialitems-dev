import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ReviewsEngineService } from '../reviews-engine/reviews-engine.service';
import { BillingService } from '../billing/billing.service';
import { MAX_REVIEW_COUNT, fiveStarOnly } from './widget-settings';
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
    if (!widget) throw new NotFoundException();
    const plan = await this.billing.planFor(user.id);
    // The full allowance of 5-star reviews, like the embed: everything the
    // engine has cached, filtered, then cut to the plan. The editor applies
    // the count itself so every change previews instantly. One request waits
    // for a real answer instead of the dashboard polling several.
    const result = await this.engine.fetchAndWait(
      widget.placeId,
      MAX_REVIEW_COUNT,
      sort,
    );
    await this.widgets.syncName(user.id, id, result.business?.name);
    return {
      ...result,
      reviews: (
        await this.hidden.filter(widget.placeId, fiveStarOnly(result.reviews))
      ).slice(0, plan.reviews),
    };
  }

  @Get(':id/logo')
  getLogo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.widgets.getLogo(user.id, id);
  }

  @Put(':id/logo')
  setLogo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { logo?: unknown },
  ) {
    return this.widgets.setLogo(user.id, id, body?.logo ?? null);
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
    if (!widget) throw new NotFoundException();
    return widget;
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
