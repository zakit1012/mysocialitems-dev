import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import type { PaypalMode } from './paypal.client';

/** Super admin: plans, PayPal keys and every customer's subscription. */
@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  // ---- subscriptions
  @Get('subscriptions')
  subscriptions() {
    return this.billing.adminSubscriptions();
  }

  @Patch('subscriptions/:userId')
  setPlan(
    @Param('userId') userId: string,
    @Body() body: { plan?: unknown; periodEnd?: unknown },
  ) {
    return this.billing.adminSetPlan(userId, body?.plan, body?.periodEnd);
  }

  @Post('subscriptions/:userId/cancel')
  cancel(@Param('userId') userId: string) {
    return this.billing.adminCancel(userId);
  }

  @Post('subscriptions/:userId/refresh')
  refresh(@Param('userId') userId: string) {
    return this.billing.adminRefresh(userId);
  }

  // ---- plans
  @Get('plans')
  plans() {
    return this.billing.adminPlans();
  }

  @Put('plans/:key')
  savePlan(@Param('key') key: string, @Body() body: Record<string, unknown>) {
    const num = (v: unknown) =>
      v === undefined || v === '' ? undefined : Number(v);
    // Plain strings only; anything else (objects, arrays) is ignored.
    const str = (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
    return this.billing.adminSavePlan({
      key,
      name: body.name === undefined ? undefined : str(body.name),
      priceUsd: num(body.priceUsd),
      sources: num(body.sources),
      widgets: num(body.widgets),
      reviews: num(body.reviews),
      // null / "unlimited" -> no cap
      views:
        body.views === null || body.views === 'unlimited'
          ? Number.MAX_SAFE_INTEGER
          : num(body.views),
      refreshHours: num(body.refreshHours),
      active: body.active === undefined ? undefined : Boolean(body.active),
      sortOrder: num(body.sortOrder),
      paypalPlanIdSandbox:
        body.paypalPlanIdSandbox === undefined
          ? undefined
          : str(body.paypalPlanIdSandbox) || null,
      paypalPlanIdLive:
        body.paypalPlanIdLive === undefined
          ? undefined
          : str(body.paypalPlanIdLive) || null,
      // "" or null -> back to 10x the monthly price
      priceYearlyUsd:
        body.priceYearlyUsd === null || body.priceYearlyUsd === ''
          ? null
          : num(body.priceYearlyUsd),
      paypalYearlyIdSandbox:
        body.paypalYearlyIdSandbox === undefined
          ? undefined
          : str(body.paypalYearlyIdSandbox) || null,
      paypalYearlyIdLive:
        body.paypalYearlyIdLive === undefined
          ? undefined
          : str(body.paypalYearlyIdLive) || null,
    });
  }

  @Post('plans/:key/paypal')
  createOnPaypal(
    @Param('key') key: string,
    @Body() body: { mode?: PaypalMode; interval?: string },
  ) {
    const mode =
      body?.mode === 'live' || body?.mode === 'sandbox' ? body.mode : undefined;
    const interval = body?.interval === 'year' ? 'year' : 'month';
    return this.billing.adminCreateOnPaypal(key, mode, interval);
  }

  // ---- PayPal keys
  @Get('paypal')
  paypal() {
    return this.billing.adminPaypalSettings();
  }

  @Put('paypal')
  savePaypal(@Body() body: Record<string, string>) {
    return this.billing.adminSavePaypal(body ?? {});
  }

  @Post('paypal/test')
  testPaypal(@Body() body: { mode: PaypalMode }) {
    return this.billing.adminTestPaypal(
      body?.mode === 'live' ? 'live' : 'sandbox',
    );
  }
}
