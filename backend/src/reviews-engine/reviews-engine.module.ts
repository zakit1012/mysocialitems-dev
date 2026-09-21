import { Global, Module } from '@nestjs/common';
import { ReviewsEngineService } from './reviews-engine.service';

@Global()
@Module({
  providers: [ReviewsEngineService],
  exports: [ReviewsEngineService],
})
export class ReviewsEngineModule {}
