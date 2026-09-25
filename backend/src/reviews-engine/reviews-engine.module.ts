import { Global, Module } from '@nestjs/common';
import { ReviewsEngineService } from './reviews-engine.service';
import { EngineSyncService } from './engine-sync.service';

@Global()
@Module({
  providers: [ReviewsEngineService, EngineSyncService],
  exports: [ReviewsEngineService],
})
export class ReviewsEngineModule {}
