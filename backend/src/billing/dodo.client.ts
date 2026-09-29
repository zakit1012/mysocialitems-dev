import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SettingsService } from '../settings/settings.service';

export type DodoMode = 'test' | 'live';

/**
 * Dodo said no, did not answer, or is not set up. Customers read a plain
 * sentence; Dodo's own words (`detail`) are logged, and shown in the admin
 * panel, where they help.
 */
export class PaymentServiceError extends HttpException {
  constructor(
    message: string,
    readonly detail: string,
    status = HttpStatus.BAD_GATEWAY,
  ) {
    super(message, status);
  }
}

const NOT_SET_UP =
  'Payments are not available right now. Please try again later, or write to support@widgetpop.com.';
const NO_ANSWER =
  'The payment service did not answer in time. Please try again in a minute.';
const REFUSED =
  'The payment service could not do that right now. Please try again in a minute; if it keeps happening, write to support@widgetpop.com.';

const TIMEOUT_MS = 20_000;
// Standard Webhooks: a signature older (or newer) than this is a replay.
const WEBHOOK_TOLERANCE_S = 5 * 60;

/** The parts of a Dodo subscription we read. */
export type DodoSubscription = {
  subscription_id: string;
  status:
    | 'pending'
    | 'active'
    | 'on_hold'
    | 'paused'
    | 'cancelled'
    | 'failed'
    | 'expired'
    | 'past_due';
  product_id: string;
  customer?: { customer_id?: string; email?: string; name?: string };
  currency?: string;
  next_billing_date?: string;
  previous_billing_date?: string;
  cancel_at_next_billing_date?: boolean;
  payment_frequency_interval?: 'Day' | 'Week' | 'Month' | 'Year';
  recurring_pre_tax_amount?: number;
  metadata?: Record<string, string>;
  past_due_ends_at?: string | null;
};

/** The parts of a Dodo payment we read. Amounts are in the smallest unit (cents, paise). */
export type DodoPayment = {
  payment_id: string;
  status?: string | null;
  subscription_id?: string | null;
  total_amount: number;
  currency: string;
  settlement_amount?: number;
  settlement_currency?: string;
  invoice_url?: string | null;
  created_at?: string;
  customer?: { customer_id?: string; email?: string; name?: string };
  metadata?: Record<string, string>;
  product_cart?: { product_id: string; quantity?: number }[] | null;
};

export type DodoRefund = {
  refund_id: string;
  payment_id: string;
  amount?: number | null;
  currency?: string | null;
  is_partial?: boolean;
  status: 'succeeded' | 'failed' | 'pending' | 'review';
};

/**
 * Dodo Payments REST client. Dodo is the merchant of record: it runs the
 * checkout, charges cards and UPI, handles sales tax and issues invoices.
 * Keys come from the admin panel (SettingsService, falling back to .env),
 * with separate test and live keys and a switch between them.
 */
@Injectable()
export class DodoClient {
  private readonly log = new Logger(DodoClient.name);

  constructor(private readonly settings: SettingsService) {}

  async mode(): Promise<DodoMode> {
    return (await this.settings.get('DODO_MODE')) === 'live' ? 'live' : 'test';
  }

  private key(mode: DodoMode, name: 'API_KEY' | 'WEBHOOK_SECRET') {
    return this.settings.get(`DODO_${mode.toUpperCase()}_${name}`);
  }

  async configured(mode?: DodoMode): Promise<boolean> {
    return Boolean(await this.key(mode ?? (await this.mode()), 'API_KEY'));
  }

  private base(mode: DodoMode) {
    return mode === 'live'
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    mode?: DodoMode,
  ): Promise<T> {
    const m = mode ?? (await this.mode());
    const apiKey = await this.key(m, 'API_KEY');
    if (!apiKey) {
      throw new PaymentServiceError(
        NOT_SET_UP,
        `Dodo Payments ${m} keys are not set.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const res = await fetch(`${this.base(m)}${path}`, {
      method,
      // Dodo answers in a second or two; never let a stuck call hold a
      // customer's page (or the hourly check) open for minutes.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((err: unknown) => {
      this.log.error(`Dodo ${m} ${method} ${path} failed: ${String(err)}`);
      throw new PaymentServiceError(NO_ANSWER, String(err));
    });
    const text = await res.text();
    if (!res.ok) {
      this.log.error(`Dodo ${m} ${method} ${path} -> ${res.status}: ${text}`);
      let detail = '';
      try {
        const parsed = JSON.parse(text) as { message?: string; code?: string };
        detail = parsed.message || parsed.code || '';
      } catch {
        /* keep generic */
      }
      throw new PaymentServiceError(
        REFUSED,
        `Dodo ${res.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      this.log.error(
        `Dodo ${m} ${method} ${path}: not JSON: ${text.slice(0, 200)}`,
      );
      throw new PaymentServiceError(
        REFUSED,
        'Dodo answered with something that is not JSON.',
      );
    }
  }

  /** Cheapest call that proves a key works. */
  async test(mode: DodoMode) {
    await this.request('GET', '/products?page_size=1', undefined, mode);
    return { ok: true, mode };
  }

  // ------------------------------------------------------------ products

  /**
   * A subscription product for one plan and period. The subscription runs
   * for 20 years, billed every month or year: with a period equal to the
   * billing frequency, Dodo would end it after a single cycle.
   */
  async createProduct(
    mode: DodoMode,
    input: { name: string; priceCents: number; interval: 'Month' | 'Year' },
  ): Promise<string> {
    const product = await this.request<{ product_id: string }>(
      'POST',
      '/products',
      {
        name: input.name,
        tax_category: 'saas',
        price: this.recurringPrice(input.priceCents, input.interval),
      },
      mode,
    );
    return product.product_id;
  }

  /**
   * Takes a fixed rupee price (a Dodo localized price) off a product, so
   * customers paying in rupees get the dollar price converted by Dodo.
   */
  async clearRupeePrice(mode: DodoMode, productId: string) {
    const path = `/products/${encodeURIComponent(productId)}/localized-prices`;
    const { items = [] } = await this.request<{
      items?: { id: string; currency: string }[];
    }>('GET', path, undefined, mode);
    for (const rule of items.filter((r) => r.currency === 'INR')) {
      await this.request(
        'DELETE',
        `${path}/${encodeURIComponent(rule.id)}`,
        undefined,
        mode,
      );
    }
  }

  /** New price for new subscribers. Dodo never reprices existing subscriptions. */
  async updateProductPrice(
    mode: DodoMode,
    productId: string,
    priceCents: number,
    interval: 'Month' | 'Year',
  ) {
    await this.request(
      'PATCH',
      `/products/${encodeURIComponent(productId)}`,
      { price: this.recurringPrice(priceCents, interval) },
      mode,
    );
  }

  private recurringPrice(priceCents: number, interval: 'Month' | 'Year') {
    return {
      type: 'recurring_price',
      currency: 'USD',
      price: priceCents,
      discount: 0,
      purchasing_power_parity: false,
      // The price shown on the site is what the customer pays, tax included.
      tax_inclusive: true,
      payment_frequency_count: 1,
      payment_frequency_interval: interval,
      subscription_period_count: 20,
      subscription_period_interval: 'Year',
      trial_period_days: 0,
    };
  }

  // ------------------------------------------------------------ checkout

  /**
   * A hosted checkout for one plan. Customers in India pay the dollar price
   * in rupees - Dodo converts it (Adaptive Currency, on in its dashboard) -
   * with UPI AutoPay and Indian cards (RBI e-mandates); everyone else in US
   * dollars with cards and wallets.
   */
  createCheckout(input: {
    mode: DodoMode;
    productId: string;
    email: string;
    name: string;
    india: boolean;
    returnUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }) {
    return this.request<{ session_id: string; checkout_url: string }>(
      'POST',
      '/checkouts',
      {
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        customer: { email: input.email, name: input.name },
        billing_currency: input.india ? 'INR' : 'USD',
        ...(input.india
          ? {
              billing_address: { country: 'IN' },
              allowed_payment_method_types: ['upi_intent', 'credit', 'debit'],
            }
          : {}),
        metadata: input.metadata,
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        feature_flags: {
          redirect_immediately: true,
          // The email ties the payment to the account; keep it the account's.
          allow_customer_editing_email: false,
        },
      },
      input.mode,
    );
  }

  // ------------------------------------------------------------ subscriptions

  getSubscription(id: string, mode?: DodoMode) {
    return this.request<DodoSubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(id)}`,
      undefined,
      mode,
    );
  }

  updateSubscription(
    id: string,
    body: Record<string, unknown>,
    mode?: DodoMode,
  ) {
    return this.request<DodoSubscription>(
      'PATCH',
      `/subscriptions/${encodeURIComponent(id)}`,
      body,
      mode,
    );
  }

  /**
   * Moves a subscription to another product. An upgrade applies at once -
   * nobody waits days for a UPI or card mandate to settle - and the
   * difference (credit for unused time, then the new price) is charged
   * alongside. A downgrade applies at the next billing date, which is then
   * charged the new plan's full price (the only mode Dodo allows there).
   */
  changePlan(id: string, productId: string, upgrade: boolean, mode?: DodoMode) {
    return this.request<unknown>(
      'POST',
      `/subscriptions/${encodeURIComponent(id)}/change-plan`,
      upgrade
        ? {
            product_id: productId,
            quantity: 1,
            proration_billing_mode: 'prorated_immediately',
            on_payment_failure: 'apply_change',
          }
        : {
            product_id: productId,
            quantity: 1,
            proration_billing_mode: 'full_immediately',
            effective_at: 'next_billing_date',
          },
      mode,
    );
  }

  /** Drops a plan change waiting for the next billing date. */
  cancelScheduledChange(id: string, mode?: DodoMode) {
    return this.request<unknown>(
      'DELETE',
      `/subscriptions/${encodeURIComponent(id)}/change-plan/scheduled`,
      undefined,
      mode,
    );
  }

  async subscriptionPayments(id: string, mode?: DodoMode) {
    const res = await this.request<{ items?: DodoPayment[] }>(
      'GET',
      `/payments?subscription_id=${encodeURIComponent(id)}&page_size=100`,
      undefined,
      mode,
    );
    return res.items ?? [];
  }

  getPayment(id: string, mode?: DodoMode) {
    return this.request<DodoPayment>(
      'GET',
      `/payments/${encodeURIComponent(id)}`,
      undefined,
      mode,
    );
  }

  /** Refunds a payment: all of it, or `amountCents` of its one product. */
  refund(
    mode: DodoMode,
    payment: { paymentId: string; productId?: string },
    amountCents?: number,
  ) {
    // Without the product a partial refund would go out as a full one.
    if (amountCents && !payment.productId) {
      throw new BadRequestException(
        'A partial refund needs the product it is for.',
      );
    }
    return this.request<DodoRefund>(
      'POST',
      '/refunds',
      {
        payment_id: payment.paymentId,
        reason: 'Refunded by support',
        ...(amountCents && payment.productId
          ? { items: [{ item_id: payment.productId, amount: amountCents }] }
          : {}),
      },
      mode,
    );
  }

  /** A one-time link to Dodo's customer portal: payment method, invoices. */
  async portalLink(customerId: string, mode?: DodoMode) {
    const res = await this.request<{ link: string }>(
      'POST',
      `/customers/${encodeURIComponent(customerId)}/customer-portal/session`,
      undefined,
      mode,
    );
    return res.link;
  }

  // ------------------------------------------------------------ webhooks

  /**
   * Standard Webhooks check: HMAC-SHA256 over "id.timestamp.body" with the
   * endpoint secret. Tries the live and the test secret, so both dashboards
   * can point at the same URL; returns the mode that signed it, or null.
   */
  async verifyWebhook(
    headers: Record<string, string | undefined>,
    rawBody: Buffer | string,
  ): Promise<DodoMode | null> {
    const id = headers['webhook-id'];
    const timestamp = headers['webhook-timestamp'];
    const signatures = headers['webhook-signature'];
    if (!id || !timestamp || !signatures) return null;
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_S) return null;

    const content = `${id}.${timestamp}.${rawBody.toString()}`;
    for (const mode of ['live', 'test'] as const) {
      const secret = await this.key(mode, 'WEBHOOK_SECRET');
      if (!secret) continue;
      const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
      const expected = createHmac('sha256', key).update(content).digest();
      for (const part of signatures.split(' ')) {
        const [version, sig] = part.split(',');
        if (version !== 'v1' || !sig) continue;
        const given = Buffer.from(sig, 'base64');
        if (
          given.length === expected.length &&
          timingSafeEqual(given, expected)
        ) {
          return mode;
        }
      }
    }
    return null;
  }
}
