import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { DealsModule } from './deals/deals.module';
import { FavoritesModule } from './favorites/favorites.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WidgetsModule } from './widgets/widgets.module';
import { SourcesModule } from './sources/sources.module';
import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';
import { ReviewsEngineModule } from './reviews-engine/reviews-engine.module';
import { PlacesModule } from './places/places.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    CategoriesModule,
    DealsModule,
    FavoritesModule,
    VouchersModule,
    ReviewsModule,
    PlacesModule,
    WidgetsModule,
    SourcesModule,
    PublicModule,
    AdminModule,
    ReviewsEngineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
