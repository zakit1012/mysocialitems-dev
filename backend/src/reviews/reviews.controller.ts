import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('deals/:dealId/reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('dealId') dealId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, dealId, dto);
  }
}
