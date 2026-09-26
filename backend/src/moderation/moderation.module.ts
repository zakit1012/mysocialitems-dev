import { Global, Module } from '@nestjs/common';
import { HiddenReviewsService } from './hidden-reviews.service';

@Global()
@Module({
  providers: [HiddenReviewsService],
  exports: [HiddenReviewsService],
})
export class ModerationModule {}
