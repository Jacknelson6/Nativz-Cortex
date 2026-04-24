import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';
import { mrrForSubscription } from '@/lib/stripe/mrr';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { data, error } = await admin
    .from('stripe_subscriptions')
    .select(
      'id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, started_at, product_name, price_nickname, unit_amount_cents, interval, interval_count, quantity, client_id, clients(name, slug)',
    )
    .order('status', { ascending: true })
    .order('started_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const subs = (data ?? []).map((s) => ({
    ...s,
    mrr_cents: mrrForSubscription({
      status: s.status,
      unit_amount_cents: s.unit_amount_cents,
      quantity: s.quantity,
      interval: s.interval,
      interval_count: s.interval_count,
    }),
  }));

  return NextResponse.json({ subscriptions: subs });
}
