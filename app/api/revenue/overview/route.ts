import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();

  const [
    mrrAgg,
    activeSubsCount,
    paidMtd,
    paidYtd,
    openInvoices,
    overdueInvoices,
    monthlyRevenueRows,
    recentEvents,
  ] = await Promise.all([
    admin.from('clients').select('mrr_cents').not('mrr_cents', 'is', null),
    admin
      .from('stripe_subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'trialing', 'past_due']),
    admin
      .from('stripe_invoices')
      .select('amount_paid_cents')
      .gte('paid_at', monthStart),
    admin
      .from('stripe_invoices')
      .select('amount_paid_cents')
      .gte('paid_at', yearStart),
    admin
      .from('stripe_invoices')
      .select('id, amount_remaining_cents, due_date, client_id, number, hosted_invoice_url, status')
      .in('status', ['open'])
      .order('due_date', { ascending: true })
      .limit(50),
    admin
      .from('stripe_invoices')
      .select('id, amount_remaining_cents, due_date, client_id, number, hosted_invoice_url')
      .eq('status', 'open')
      .lt('due_date', new Date().toISOString())
      .order('due_date', { ascending: true })
      .limit(25),
    admin
      .from('stripe_invoices')
      .select('paid_at, amount_paid_cents')
      .gte('paid_at', twelveMonthsAgo)
      .not('paid_at', 'is', null),
    admin
      .from('client_lifecycle_events')
      .select('id, client_id, type, title, description, occurred_at, metadata, clients(name, slug)')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  const mrrCents = (mrrAgg.data ?? []).reduce((sum, r) => sum + (r.mrr_cents ?? 0), 0);
  const arrCents = mrrCents * 12;
  const mtdCents = (paidMtd.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const ytdCents = (paidYtd.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const arOpenCents = (openInvoices.data ?? []).reduce(
    (s, r) => s + (r.amount_remaining_cents ?? 0),
    0,
  );
  const arOverdueCents = (overdueInvoices.data ?? []).reduce(
    (s, r) => s + (r.amount_remaining_cents ?? 0),
    0,
  );

  const monthlyBuckets = new Map<string, number>();
  for (const r of monthlyRevenueRows.data ?? []) {
    if (!r.paid_at) continue;
    const d = new Date(r.paid_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyBuckets.set(key, (monthlyBuckets.get(key) ?? 0) + (r.amount_paid_cents ?? 0));
  }
  const monthlyRevenue = Array.from(monthlyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, cents }));

  const agingBuckets = agingBucketsFor(overdueInvoices.data ?? []);

  return NextResponse.json({
    kpis: {
      mrr_cents: mrrCents,
      arr_cents: arrCents,
      mtd_revenue_cents: mtdCents,
      ytd_revenue_cents: ytdCents,
      ar_open_cents: arOpenCents,
      ar_overdue_cents: arOverdueCents,
      active_subscriptions: activeSubsCount.count ?? 0,
    },
    monthlyRevenue,
    aging: agingBuckets,
    recentEvents: recentEvents.data ?? [],
  });
}

function agingBucketsFor(
  rows: Array<{ due_date: string | null; amount_remaining_cents: number | null }>,
) {
  const now = Date.now();
  const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  for (const r of rows) {
    if (!r.due_date) continue;
    const daysPast = Math.floor((now - new Date(r.due_date).getTime()) / 86400000);
    const amount = r.amount_remaining_cents ?? 0;
    if (daysPast <= 30) buckets['0_30'] += amount;
    else if (daysPast <= 60) buckets['31_60'] += amount;
    else if (daysPast <= 90) buckets['61_90'] += amount;
    else buckets['90_plus'] += amount;
  }
  return buckets;
}
