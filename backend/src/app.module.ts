import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { WidgetsModule } from './widgets/widgets.module';
import { BusinessesModule } from './businesses/businesses.module';
import { SourcesModule } from './sources/sources.module';
import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';
import { ReviewsEngineModule } from './reviews-engine/reviews-engine.module';
import { PlacesModule } from './places/places.module';
import { BillingModule } from './billing/billing.module';
import { SettingsModule } from './settings/settings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ModerationModule } from './moderation/moderation.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Per client IP. Generous for normal browsing; auth routes tighten it.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    PlacesModule,
    WidgetsModule,
    BusinessesModule,
    SourcesModule,
    PublicModule,
    AdminModule,
    ReviewsEngineModule,
    SettingsModule,
    BillingModule,
    AnalyticsModule,
    ModerationModule,
    EmailCampaignsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
