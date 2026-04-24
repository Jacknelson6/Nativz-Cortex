import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents, formatCentsCompact } from '@/lib/format/money';
import { LifecycleStatePill } from './status-pill';

export async function RevenueClientsTab() {
  const admin = createAdminClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const periodMonth = monthStart.toISOString().slice(0, 10);

  const [clientsRes, paidRes, refundRes, openArRes, adSpendRes, subsRes] = await Promise.all([
    admin
      .from('clients')
      .select(
        'id, name, slug, lifecycle_state, mrr_cents, boosting_budget_cents, stripe_customer_id, hide_from_roster',
      )
      .order('mrr_cents', { ascending: false })
      .order('name', { ascending: true }),
    admin.from('stripe_invoices').select('client_id, amount_paid_cents').not('client_id', 'is', null),
    admin
      .from('stripe_refunds')
      .select('client_id, amount_cents, status')
      .eq('status', 'succeeded')
      .not('client_id', 'is', null),
    admin
      .from('stripe_invoices')
      .select('client_id, amount_remaining_cents')
      .eq('status', 'open')
      .not('client_id', 'is', null),
    admin.from('client_ad_spend').select('client_id, spend_cents').eq('period_month', periodMonth),
    admin
      .from('stripe_subscriptions')
      .select('client_id')
      .in('status', ['active', 'trialing', 'past_due']),
  ]);

  type Stats = { lifetime: number; ar: number; ad: number; subs: number };
  const stats = new Map<string, Stats>();
  const get = (id: string): Stats => {
    const existing = stats.get(id);
    if (existing) return existing;
    const fresh = { lifetime: 0, ar: 0, ad: 0, subs: 0 };
    stats.set(id, fresh);
    return fresh;
  };
  for (const r of paidRes.data ?? []) if (r.client_id) get(r.client_id).lifetime += r.amount_paid_cents ?? 0;
  for (const r of refundRes.data ?? []) if (r.client_id) get(r.client_id).lifetime -= r.amount_cents ?? 0;
  for (const r of openArRes.data ?? []) if (r.client_id) get(r.client_id).ar += r.amount_remaining_cents ?? 0;
  for (const r of adSpendRes.data ?? []) if (r.client_id) get(r.client_id).ad += r.spend_cents ?? 0;
  for (const r of subsRes.data ?? []) if (r.client_id) get(r.client_id).subs += 1;

  // Clamp negative lifetime (e.g. refund exceeds paid) to zero for display.
  for (const s of stats.values()) s.lifetime = Math.max(0, s.lifetime);

  const rows = (clientsRes.data ?? []).filter((c) => !c.hide_from_roster);

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">Lifecycle</th>
            <th className="px-4 py-2.5 font-medium text-right">MRR</th>
            <th className="px-4 py-2.5 font-medium text-right">Lifetime</th>
            <th className="px-4 py-2.5 font-medium text-right">Open AR</th>
            <th className="px-4 py-2.5 font-medium text-right">Ads MTD</th>
            <th className="px-4 py-2.5 font-medium text-right">Subs</th>
            <th className="px-4 py-2.5 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((c) => {
            const s = stats.get(c.id) ?? { lifetime: 0, ar: 0, ad: 0, subs: 0 };
            return (
              <tr key={c.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 text-text-primary">
                  <div className="flex flex-col">
                    <Link
                      href={`/admin/clients/${c.slug}/billing`}
                      className="hover:text-nz-cyan"
                    >
                      {c.name}
                    </Link>
                    {!c.stripe_customer_id ? (
                      <span className="text-[10px] text-amber-300/80">no Stripe link</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <LifecycleStatePill state={c.lifecycle_state ?? 'lead'} />
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                  {formatCents(c.mrr_cents ?? 0)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {formatCentsCompact(s.lifetime)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono ${
                    s.ar > 0 ? 'text-amber-300' : 'text-text-muted'
                  }`}
                >
                  {formatCents(s.ar)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {formatCents(s.ad)}
                  {c.boosting_budget_cents && c.boosting_budget_cents > 0 ? (
                    <span className="text-text-muted"> / {formatCents(c.boosting_budget_cents)}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right text-text-secondary">{s.subs}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/admin/clients/${c.slug}/billing`}
                    className="inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:text-nz-cyan/80"
                  >
                    Open <ArrowUpRight size={12} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
