import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  overview(@CurrentUser() user: AuthUser) {
    return this.billing.overview(user.id);
  }

  /** For the pricing section on the home page, so it follows admin edits. */
  @Get('plans')
  plans() {
    return this.billing.publicPlans();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() body: { plan: string; interval?: string },
  ) {
    return this.billing.startCheckout(user.id, body?.plan, body?.interval);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  confirm(
    @CurrentUser() user: AuthUser,
    @Body() body: { subscriptionId: string },
  ) {
    return this.billing.confirm(user.id, String(body?.subscriptionId ?? ''));
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: AuthUser) {
    return this.billing.cancel(user.id);
  }

  /** PayPal calls this. Authenticated by PayPal's signature, not a JWT. */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  webhook(@Headers() headers: Record<string, string>, @Body() event: unknown) {
    return this.billing.handleWebhook(headers, event);
  }
}
