import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { ReviewLinksController } from './review-links.controller';
import { BusinessesService } from './businesses.service';

@Module({
  controllers: [BusinessesController, ReviewLinksController],
  providers: [BusinessesService],
})
export class BusinessesModule {}
