import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { mrrForSubscription, mrrForStripeSubscription, annualize } from './mrr';

describe('mrrForSubscription', () => {
  it('returns 0 when status is not active/trialing/past_due', () => {
    expect(
      mrrForSubscription({
        status: 'canceled',
        unit_amount_cents: 10000,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(0);
    expect(
      mrrForSubscription({
        status: 'incomplete',
        unit_amount_cents: 10000,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(0);
  });

  it('counts past_due as MRR (still on the books until churn)', () => {
    expect(
      mrrForSubscription({
        status: 'past_due',
        unit_amount_cents: 50000,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(50000);
  });

  it('returns the unit amount for a simple monthly sub', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 100000,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(100000);
  });

  it('multiplies by quantity', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 10000,
        quantity: 3,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(30000);
  });

  it('divides annual by 12', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 1200000,
        quantity: 1,
        interval: 'year',
        interval_count: 1,
      }),
    ).toBe(100000);
  });

  it('prorates a 2-month interval', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 200000,
        quantity: 1,
        interval: 'month',
        interval_count: 2,
      }),
    ).toBe(100000);
  });

  it('weekly → 52/12 of the unit amount', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 100,
        quantity: 1,
        interval: 'week',
        interval_count: 1,
      }),
    ).toBe(Math.round((100 * 52) / 12));
  });

  it('daily → 30× the unit amount', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 100,
        quantity: 1,
        interval: 'day',
        interval_count: 1,
      }),
    ).toBe(3000);
  });

  it('returns 0 for null unit_amount_cents', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: null,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(0);
  });

  it('returns 0 for missing interval', () => {
    expect(
      mrrForSubscription({
        status: 'active',
        unit_amount_cents: 10000,
        quantity: 1,
        interval: null,
        interval_count: null,
      }),
    ).toBe(0);
  });
});

describe('mrrForStripeSubscription', () => {
  it('sums across multiple items', () => {
    const sub = {
      status: 'active',
      items: {
        data: [
          {
            quantity: 1,
            price: {
              unit_amount: 50000,
              recurring: { interval: 'month', interval_count: 1 },
            },
          },
          {
            quantity: 2,
            price: {
              unit_amount: 25000,
              recurring: { interval: 'month', interval_count: 1 },
            },
          },
        ],
      },
    } as unknown as Stripe.Subscription;
    expect(mrrForStripeSubscription(sub)).toBe(50000 + 25000 * 2);
  });

  it('skips items without a recurring price (one-time add-ons)', () => {
    const sub = {
      status: 'active',
      items: {
        data: [
          { quantity: 1, price: { unit_amount: 50000, recurring: { interval: 'month', interval_count: 1 } } },
          { quantity: 1, price: { unit_amount: 99, recurring: null } },
        ],
      },
    } as unknown as Stripe.Subscription;
    expect(mrrForStripeSubscription(sub)).toBe(50000);
  });
});

describe('annualize', () => {
  it('multiplies MRR by 12', () => {
    expect(annualize(100000)).toBe(1200000);
  });
});
