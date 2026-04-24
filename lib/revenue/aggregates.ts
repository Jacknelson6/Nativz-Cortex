/**
 * Net-of-refund revenue math. Every "lifetime paid" / "MRR" / "month-to-date"
 * number in the UI + exports should route through these helpers so a refund
 * is subtracted from the original invoice amount.
 *
 * We treat a "paid" invoice as the thing that moved money in, and a "refund"
 * as the thing that moved money back. Net = paid - refunded. This matches
 * QuickBooks and bank reconciliation conventions.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type NetOpts = {
  clientId?: string;
  since?: string; // ISO timestamp — counts only invoices paid on/after this
  until?: string; // ISO timestamp — counts only invoices paid on/before this
};

export async function netLifetimeRevenueCents(
  admin: SupabaseClient,
  opts: NetOpts = {},
): Promise<number> {
  const paid = await sumPaidInvoiceCents(admin, opts);
  const refunded = await sumRefundedCents(admin, opts);
  return Math.max(0, paid - refunded);
}

/**
 * Per-month breakdown of net revenue. Months are 'YYYY-MM'. Returns entries
 * only for months that had activity.
 */
export async function netRevenueByMonth(
  admin: SupabaseClient,
  opts: NetOpts = {},
): Promise<Array<{ month: string; netCents: number }>> {
  const [paidRows, refundRows] = await Promise.all([
    fetchPaidRows(admin, opts),
    fetchRefundRows(admin, opts),
  ]);

  const netByMonth = new Map<string, number>();
  for (const r of paidRows) {
    if (!r.paid_at) continue;
    const month = r.paid_at.slice(0, 7);
    netByMonth.set(month, (netByMonth.get(month) ?? 0) + (r.amount_paid_cents ?? 0));
  }
  for (const r of refundRows) {
    if (!r.created_at) continue;
    const month = r.created_at.slice(0, 7);
    netByMonth.set(month, (netByMonth.get(month) ?? 0) - (r.amount_cents ?? 0));
  }

  return Array.from(netByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, netCents]) => ({ month, netCents: Math.max(0, netCents) }));
}

async function sumPaidInvoiceCents(admin: SupabaseClient, opts: NetOpts): Promise<number> {
  const rows = await fetchPaidRows(admin, opts);
  return rows.reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
}

async function sumRefundedCents(admin: SupabaseClient, opts: NetOpts): Promise<number> {
  const rows = await fetchRefundRows(admin, opts);
  return rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
}

async function fetchPaidRows(
  admin: SupabaseClient,
  opts: NetOpts,
): Promise<Array<{ paid_at: string | null; amount_paid_cents: number | null }>> {
  let q = admin
    .from('stripe_invoices')
    .select('paid_at, amount_paid_cents')
    .not('paid_at', 'is', null);
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.since) q = q.gte('paid_at', opts.since);
  if (opts.until) q = q.lte('paid_at', opts.until);
  const { data } = await q;
  return data ?? [];
}

async function fetchRefundRows(
  admin: SupabaseClient,
  opts: NetOpts,
): Promise<Array<{ created_at: string | null; amount_cents: number | null }>> {
  let q = admin
    .from('stripe_refunds')
    .select('created_at, amount_cents, status')
    .eq('status', 'succeeded');
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.since) q = q.gte('created_at', opts.since);
  if (opts.until) q = q.lte('created_at', opts.until);
  const { data } = await q;
  return data ?? [];
}
