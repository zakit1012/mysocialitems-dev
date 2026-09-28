import { DodoClient } from './dodo.client';

// @nestjs/config ships as ESM, which jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

/**
 * What a plan change asks Dodo for. A downgrade at the next billing date
 * must say full_immediately: Dodo refuses anything else there (422).
 */
function bodyOf(upgrade: boolean) {
  const client = new DodoClient({} as never);
  const request = jest.spyOn(client, 'request').mockResolvedValue(undefined);
  void client.changePlan('sub_1', 'prod_2', upgrade, 'test');
  return request.mock.calls[0];
}

describe('changing plan on Dodo', () => {
  it('applies an upgrade at once, whatever the payment is doing', () => {
    const [method, path, body, mode] = bodyOf(true);
    expect([method, path, mode]).toEqual([
      'POST',
      '/subscriptions/sub_1/change-plan',
      'test',
    ]);
    expect(body).toEqual({
      product_id: 'prod_2',
      quantity: 1,
      proration_billing_mode: 'prorated_immediately',
      on_payment_failure: 'apply_change',
    });
  });

  it('schedules a downgrade the way Dodo accepts', () => {
    const [, , body] = bodyOf(false);
    expect(body).toEqual({
      product_id: 'prod_2',
      quantity: 1,
      proration_billing_mode: 'full_immediately',
      effective_at: 'next_billing_date',
    });
  });
});
