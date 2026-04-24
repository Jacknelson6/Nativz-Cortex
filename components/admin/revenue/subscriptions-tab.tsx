import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents } from '@/lib/format/money';
import { mrrForSubscription } from '@/lib/stripe/mrr';
import { SubscriptionStatusPill } from './status-pill';

export async function RevenueSubscriptionsTab() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('stripe_subscriptions')
    .select(
      'id, status, current_period_end, cancel_at_period_end, started_at, product_name, price_nickname, unit_amount_cents, interval, interval_count, quantity, client_id, clients(name, slug)',
    )
    .order('status', { ascending: true })
    .order('started_at', { ascending: false });

  const rows = (data ?? []).map((s) => ({
    ...s,
    mrr_cents: mrrForSubscription(s),
  }));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
        No subscriptions synced yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">Plan</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">MRR</th>
            <th className="px-4 py-2.5 font-medium text-right">Price</th>
            <th className="px-4 py-2.5 font-medium">Next invoice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((s) => {
            const c = s.clients as { name?: string | null; slug?: string | null } | null;
            const interval = s.interval
              ? `${s.interval_count && s.interval_count > 1 ? `${s.interval_count} ` : ''}${s.interval}`
              : null;
            return (
              <tr key={s.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 text-text-primary">
                  {c?.slug ? (
                    <Link href={`/admin/clients/${c.slug}/billing`} className="hover:text-nz-cyan">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="text-text-muted">Unlinked</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">
                  {s.product_name ?? s.price_nickname ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  <SubscriptionStatusPill status={s.status} />
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                  {formatCents(s.mrr_cents)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {s.unit_amount_cents != null ? formatCents(s.unit_amount_cents) : '—'}
                  {interval ? <span className="text-text-muted"> / {interval}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">
                  {s.current_period_end
                    ? new Date(s.current_period_end).toLocaleDateString('en-US')
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
