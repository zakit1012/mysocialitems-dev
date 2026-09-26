import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import type { DodoMode } from './dodo.client';

/** Super admin: plans, Dodo Payments keys and every customer's subscription. */
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

  // ---- payments
  @Get('payments')
  payments(@Query('mode') mode?: string) {
    return this.billing.adminPayments(mode);
  }

  @Post('payments/:id/refund')
  refund(@Param('id') id: string, @Body() body: { amount?: unknown }) {
    return this.billing.adminRefund(id, body?.amount);
  }

  @Get('invoice-settings')
  invoiceSettings() {
    return this.billing.adminInvoiceSettings();
  }

  @Put('invoice-settings')
  saveInvoiceSettings(@Body() body: Record<string, unknown>) {
    return this.billing.adminSaveInvoiceSettings(body ?? {});
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
    // A product id: left alone when not sent, cleared when sent empty.
    const id = (v: unknown) => (v === undefined ? undefined : str(v) || null);
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
      // "" or null -> back to 10x the monthly price
      priceYearlyUsd:
        body.priceYearlyUsd === null || body.priceYearlyUsd === ''
          ? null
          : num(body.priceYearlyUsd),
      dodoMonthlyIdTest: id(body.dodoMonthlyIdTest),
      dodoMonthlyIdLive: id(body.dodoMonthlyIdLive),
      dodoYearlyIdTest: id(body.dodoYearlyIdTest),
      dodoYearlyIdLive: id(body.dodoYearlyIdLive),
    });
  }

  @Post('plans/:key/dodo')
  createOnDodo(
    @Param('key') key: string,
    @Body() body: { mode?: DodoMode; interval?: string },
  ) {
    const mode =
      body?.mode === 'live' || body?.mode === 'test' ? body.mode : undefined;
    const interval = body?.interval === 'year' ? 'year' : 'month';
    return this.billing.adminCreateOnDodo(key, mode, interval);
  }

  // ---- Dodo Payments keys
  @Get('dodo')
  dodo() {
    return this.billing.adminDodoSettings();
  }

  @Put('dodo')
  saveDodo(@Body() body: Record<string, string>) {
    return this.billing.adminSaveDodo(body ?? {});
  }

  @Post('dodo/test')
  testDodo(@Body() body: { mode: DodoMode }) {
    return this.billing.adminTestDodo(body?.mode === 'live' ? 'live' : 'test');
  }
}
