import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type PaypalMode = 'sandbox' | 'live';

type Token = { value: string; expiresAt: number };

/**
 * PayPal REST client. Credentials come from the admin panel (SettingsService,
 * falling back to .env), with separate sandbox and live keys and a switch
 * between them - the way Stripe separates test and live mode.
 */
@Injectable()
export class PaypalClient {
  private readonly log = new Logger(PaypalClient.name);
  private tokens: Partial<Record<PaypalMode, Token>> = {};

  constructor(private readonly settings: SettingsService) {}

  async mode(): Promise<PaypalMode> {
    return (await this.settings.get('PAYPAL_MODE')) === 'live'
      ? 'live'
      : 'sandbox';
  }

  /** Mode-specific key, e.g. PAYPAL_LIVE_CLIENT_ID; old unprefixed names still work. */
  private async cred(
    mode: PaypalMode,
    name: 'CLIENT_ID' | 'CLIENT_SECRET' | 'WEBHOOK_ID' | 'PRODUCT_ID',
  ) {
    const prefixed = await this.settings.get(
      `PAYPAL_${mode.toUpperCase()}_${name}`,
    );
    if (prefixed) return prefixed;
    // Legacy single-environment variables apply to whichever mode .env chose.
    return (await this.mode()) === mode
      ? this.settings.get(`PAYPAL_${name}`)
      : undefined;
  }

  async configured(mode?: PaypalMode): Promise<boolean> {
    const m = mode ?? (await this.mode());
    return Boolean(
      (await this.cred(m, 'CLIENT_ID')) &&
      (await this.cred(m, 'CLIENT_SECRET')),
    );
  }

  private base(mode: PaypalMode) {
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private async accessToken(mode: PaypalMode): Promise<string> {
    const cached = this.tokens[mode];
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

    const id = await this.cred(mode, 'CLIENT_ID');
    const secret = await this.cred(mode, 'CLIENT_SECRET');
    if (!id || !secret) {
      throw new ServiceUnavailableException(`PayPal ${mode} keys are not set.`);
    }
    const res = await fetch(`${this.base(mode)}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      this.log.error(
        `PayPal ${mode} auth failed: ${res.status} ${await res.text()}`,
      );
      throw new BadGatewayException(`PayPal rejected the ${mode} keys.`);
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokens[mode] = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  /** Drop cached tokens - call after keys change in the admin panel. */
  resetTokens() {
    this.tokens = {};
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    mode?: PaypalMode,
  ): Promise<T> {
    const m = mode ?? (await this.mode());
    const res = await fetch(`${this.base(m)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken(m)}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.log.error(`PayPal ${m} ${method} ${path} -> ${res.status}: ${text}`);
      let detail = '';
      try {
        const parsed = JSON.parse(text) as {
          message?: string;
          details?: { description?: string }[];
        };
        detail = parsed.details?.[0]?.description || parsed.message || '';
      } catch {
        /* keep generic */
      }
      throw new BadGatewayException(
        `PayPal ${res.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Cheapest possible call that proves the keys work. */
  async test(mode: PaypalMode) {
    this.tokens[mode] = undefined;
    await this.accessToken(mode);
    return { ok: true, mode };
  }

  // ------------------------------------------------------------ catalog

  /** The product every plan hangs off, created once per environment. */
  async ensureProduct(mode: PaypalMode): Promise<string> {
    const existing = await this.cred(mode, 'PRODUCT_ID');
    if (existing) return existing;
    const product = await this.request<{ id: string }>(
      'POST',
      '/v1/catalogs/products',
      {
        name: 'My Social Items',
        description: 'Google review widgets',
        type: 'SERVICE',
        category: 'SOFTWARE',
      },
      mode,
    );
    await this.settings.set(
      `PAYPAL_${mode.toUpperCase()}_PRODUCT_ID`,
      product.id,
    );
    return product.id;
  }

  async createPlan(
    mode: PaypalMode,
    name: string,
    priceUsd: number,
    interval: 'MONTH' | 'YEAR' = 'MONTH',
  ): Promise<string> {
    const productId = await this.ensureProduct(mode);
    const plan = await this.request<{ id: string }>(
      'POST',
      '/v1/billing/plans',
      {
        product_id: productId,
        name,
        status: 'ACTIVE',
        billing_cycles: [
          {
            frequency: { interval_unit: interval, interval_count: 1 },
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: { value: priceUsd.toFixed(2), currency_code: 'USD' },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          // Monthly gets one missed month of grace; a yearly plan pauses on its
          // first failed renewal, or a missed year would run on for free.
          payment_failure_threshold: interval === 'YEAR' ? 1 : 2,
        },
      },
      mode,
    );
    return plan.id;
  }

  /** PayPal notifies existing subscribers and applies it from their next cycle. */
  async updatePlanPrice(mode: PaypalMode, planId: string, priceUsd: number) {
    await this.request(
      'POST',
      `/v1/billing/plans/${encodeURIComponent(planId)}/update-pricing-schemes`,
      {
        pricing_schemes: [
          {
            billing_cycle_sequence: 1,
            pricing_scheme: {
              fixed_price: { value: priceUsd.toFixed(2), currency_code: 'USD' },
            },
          },
        ],
      },
      mode,
    );
  }

  /** How many failed payments PayPal allows before it suspends a subscription. */
  async setFailureThreshold(
    mode: PaypalMode,
    planId: string,
    threshold: number,
  ) {
    await this.request(
      'PATCH',
      `/v1/billing/plans/${encodeURIComponent(planId)}`,
      [
        {
          op: 'replace',
          path: '/payment_preferences/payment_failure_threshold',
          value: threshold,
        },
      ],
      mode,
    );
  }

  async setPlanActive(mode: PaypalMode, planId: string, active: boolean) {
    await this.request(
      'POST',
      `/v1/billing/plans/${encodeURIComponent(planId)}/${active ? 'activate' : 'deactivate'}`,
      undefined,
      mode,
    );
  }

  // -------------------------------------------------------- subscriptions

  async createSubscription(input: {
    planId: string;
    customId: string;
    email: string;
    returnUrl: string;
    cancelUrl: string;
    /** First charge on this date instead of now (ISO time). */
    startTime?: string;
  }) {
    return this.request<{
      id: string;
      status: string;
      links: { rel: string; href: string }[];
    }>('POST', '/v1/billing/subscriptions', {
      plan_id: input.planId,
      custom_id: input.customId,
      ...(input.startTime ? { start_time: input.startTime } : {}),
      subscriber: { email_address: input.email },
      application_context: {
        brand_name: 'My Social Items',
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    });
  }

  getSubscription(id: string) {
    return this.request<PaypalSubscription>(
      'GET',
      `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
    );
  }

  cancelSubscription(id: string, reason: string) {
    return this.request<unknown>(
      'POST',
      `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
      { reason },
    );
  }

  /** Every charge on a subscription between two dates. */
  async listTransactions(id: string, start: Date, end: Date) {
    const q = `start_time=${encodeURIComponent(start.toISOString())}&end_time=${encodeURIComponent(end.toISOString())}`;
    const res = await this.request<{ transactions?: PaypalTransaction[] }>(
      'GET',
      `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?${q}`,
    );
    return res.transactions ?? [];
  }

  /** Refunds a payment: all of it, or `amount` (e.g. "4.50") of it. */
  refundSale(
    mode: PaypalMode,
    saleId: string,
    amount?: { total: string; currency: string },
  ) {
    return this.request<{ id: string; state?: string }>(
      'POST',
      `/v1/payments/sale/${encodeURIComponent(saleId)}/refund`,
      amount ? { amount } : {},
      mode,
    );
  }

  /**
   * Asks PayPal whether a webhook really came from PayPal. Without this anyone
   * could POST "subscription activated" and get a paid plan for free.
   */
  async verifyWebhook(
    headers: Record<string, string | undefined>,
    event: unknown,
  ): Promise<boolean> {
    const mode = await this.mode();
    const webhookId = await this.cred(mode, 'WEBHOOK_ID');
    if (!webhookId || !(await this.configured(mode))) {
      this.log.error(`No PayPal ${mode} webhook id/keys - rejecting webhook.`);
      return false;
    }
    const result = await this.request<{ verification_status: string }>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: event,
      },
      mode,
    );
    return result.verification_status === 'SUCCESS';
  }
}

export type PaypalSubscription = {
  id: string;
  status:
    | 'APPROVAL_PENDING'
    | 'APPROVED'
    | 'ACTIVE'
    | 'SUSPENDED'
    | 'CANCELLED'
    | 'EXPIRED';
  plan_id: string;
  custom_id?: string;
  subscriber?: { email_address?: string };
  billing_info?: {
    next_billing_time?: string;
    /** Money PayPal failed to collect and is still owed. */
    outstanding_balance?: { value: string; currency_code: string };
    failed_payments_count?: number;
    last_payment?: {
      amount?: { value: string; currency_code: string };
      time?: string;
    };
    last_failed_payment?: {
      amount?: { value: string; currency_code: string };
      time?: string;
    };
  };
};

export type PaypalTransaction = {
  /** The same id as the sale in PAYMENT.SALE webhooks. */
  id: string;
  status: string;
  time?: string;
  amount_with_breakdown?: {
    gross_amount?: { value: string; currency_code: string };
    fee_amount?: { value: string; currency_code: string };
  };
};
