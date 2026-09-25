import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({ imports: [AnalyticsModule], controllers: [PublicController] })
export class PublicModule {}
