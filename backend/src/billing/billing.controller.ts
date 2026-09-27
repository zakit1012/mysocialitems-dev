import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
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
    @Body() body: { plan: string; interval?: string; region?: string },
  ) {
    // region "IN": the dollar price in rupees (Dodo converts it), with UPI
    // AutoPay and Indian cards.
    return this.billing.startCheckout(
      user.id,
      body?.plan,
      body?.interval,
      body?.region,
    );
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

  /** Takes back a cancellation before the paid period ends. */
  @Post('resume')
  @UseGuards(JwtAuthGuard)
  resume(@CurrentUser() user: AuthUser) {
    return this.billing.resume(user.id);
  }

  /** A link to Dodo's customer portal: update the card or UPI, see invoices. */
  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@CurrentUser() user: AuthUser) {
    return this.billing.portal(user.id);
  }

  /** Every payment the customer has made, each with its invoice. */
  @Get('payments')
  @UseGuards(JwtAuthGuard)
  payments(@CurrentUser() user: AuthUser) {
    return this.billing.payments(user.id);
  }

  /** One invoice: the customer's own, or any for an admin. */
  @Get('invoices/:id')
  @UseGuards(JwtAuthGuard)
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billing.invoice(user, id);
  }

  /** The name, address and tax id printed on invoices. */
  @Put('details')
  @UseGuards(JwtAuthGuard)
  details(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.billing.saveDetails(user.id, body ?? {});
  }

  /**
   * Dodo Payments calls this. Authenticated by its signature over the exact
   * bytes sent (see main.ts, rawBody), not a JWT.
   */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  webhook(
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.billing.handleWebhook(headers, req.rawBody);
  }
}
