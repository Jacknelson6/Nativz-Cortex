import type Stripe from 'stripe';

type IntervalLike = 'day' | 'week' | 'month' | 'year';

export function mrrForSubscription(sub: {
  status: string;
  unit_amount_cents?: number | null;
  quantity?: number | null;
  interval?: string | null;
  interval_count?: number | null;
}): number {
  if (!includedInMrr(sub.status)) return 0;
  if (!sub.interval) return 0;
  const unit = sub.unit_amount_cents ?? 0;
  const qty = sub.quantity ?? 1;
  const gross = unit * qty;
  const count = sub.interval_count ?? 1;
  return Math.round(normalizeToMonth(gross, sub.interval as IntervalLike, count));
}

export function mrrForStripeSubscription(sub: Stripe.Subscription): number {
  if (!includedInMrr(sub.status)) return 0;
  return sub.items.data.reduce((sum, item) => {
    const price = item.price;
    const unit = price.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    const gross = unit * qty;
    const recurring = price.recurring;
    if (!recurring) return sum;
    return sum + normalizeToMonth(gross, recurring.interval as IntervalLike, recurring.interval_count ?? 1);
  }, 0);
}

function normalizeToMonth(amount: number, interval: IntervalLike, count: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || count <= 0) return 0;
  switch (interval) {
    case 'day':
      return (amount * 30) / count;
    case 'week':
      return (amount * 52) / (12 * count);
    case 'month':
      return amount / count;
    case 'year':
      return amount / (12 * count);
    default:
      return 0;
  }
}

function includedInMrr(status: string): boolean {
  // past_due is still on the books — we count it as MRR until churn.
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export function annualize(mrrCents: number): number {
  return mrrCents * 12;
}
