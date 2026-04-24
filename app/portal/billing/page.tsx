import { notFound, redirect } from 'next/navigation';
import { ExternalLink, FileDown } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { formatCents, formatCentsCompact } from '@/lib/format/money';
import { mrrForSubscription } from '@/lib/stripe/mrr';
import { KpiTile } from '@/components/admin/revenue/kpi-tile';
import {
  InvoiceStatusPill,
  SubscriptionStatusPill,
} from '@/components/admin/revenue/status-pill';

export const dynamic = 'force-dynamic';

const AD_SPEND_SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  meta_api: 'Auto-synced (Meta)',
  google_api: 'Auto-synced (Google)',
  tiktok_api: 'Auto-synced (TikTok)',
  import: 'Imported',
};

export default async function PortalBillingPage() {
  // RLS-aware client — portal read policies from migrations 155 + 159 scope
  // every query to rows where the viewer is in user_client_access. If a
  // client is accidentally missing the link, they see empty data rather
  // than another customer's invoices.
  const db = await createServerSupabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/portal/login');

  const portal = await getPortalClient();
  if (!portal) notFound();
  const { client } = portal;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const periodMonth = monthStart.toISOString().slice(0, 10);

  const [
    { data: clientRow },
    { data: invoices },
    { data: subs },
    { data: lifetimeRes },
    { data: openArRes },
    { data: adSpendRows },
  ] = await Promise.all([
    db
      .from('clients')
      .select('mrr_cents, boosting_budget_cents, lifecycle_state, stripe_customer_id')
      .eq('id', client.id)
      .single(),
    db
      .from('stripe_invoices')
      .select(
        'id, number, status, amount_due_cents, amount_paid_cents, amount_remaining_cents, currency, due_date, paid_at, hosted_invoice_url, invoice_pdf, created_at',
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('stripe_subscriptions')
      .select(
        'id, status, current_period_end, cancel_at_period_end, product_name, price_nickname, unit_amount_cents, interval, interval_count, quantity',
      )
      .eq('client_id', client.id)
      .order('status')
      .order('started_at', { ascending: false }),
    db.from('stripe_invoices').select('amount_paid_cents').eq('client_id', client.id),
    db
      .from('stripe_invoices')
      .select('amount_remaining_cents')
      .eq('client_id', client.id)
      .eq('status', 'open'),
    db
      .from('client_ad_spend')
      .select('platform, campaign_label, spend_cents, period_month, source')
      .eq('client_id', client.id)
      .order('period_month', { ascending: false })
      .limit(200),
  ]);

  const lifetime = (lifetimeRes ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const openAr = (openArRes ?? []).reduce((s, r) => s + (r.amount_remaining_cents ?? 0), 0);
  const adSpendMtd = (adSpendRows ?? [])
    .filter((r) => r.period_month === periodMonth)
    .reduce((s, r) => s + (r.spend_cents ?? 0), 0);
  const boostBudget = clientRow?.boosting_budget_cents ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Billing
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {client.name} — billing &amp; invoices
        </h1>
        <p className="text-sm text-text-muted">
          Your recent invoices, active subscriptions, and payment history. Click any invoice to
          view or pay it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Current MRR" value={formatCents(clientRow?.mrr_cents ?? 0)} tone="brand" />
        <KpiTile label="Lifetime paid" value={formatCentsCompact(lifetime)} tone="good" />
        <KpiTile
          label="Open balance"
          value={formatCents(openAr)}
          tone={openAr > 0 ? 'warn' : 'neutral'}
        />
        <KpiTile
          label="Ads this month"
          value={formatCents(adSpendMtd)}
          sub={boostBudget > 0 ? `Budget ${formatCents(boostBudget)}` : 'No budget set'}
          tone={boostBudget > 0 && adSpendMtd > boostBudget ? 'warn' : 'neutral'}
        />
      </div>

      {adSpendRows && adSpendRows.length > 0 ? (
        <section className="rounded-xl border border-nativz-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">Ad spend</h2>
          <p className="mt-1 text-[11px] text-text-muted">
            Recorded spend per platform and month. Auto-synced from Meta where connected.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2 font-medium">Month</th>
                  <th className="py-2 font-medium">Platform</th>
                  <th className="py-2 font-medium">Campaign</th>
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium text-right">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {adSpendRows.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 font-mono text-[12px] text-text-secondary">
                      {r.period_month}
                    </td>
                    <td className="py-2 capitalize text-text-secondary">{r.platform}</td>
                    <td className="py-2 text-text-secondary">{r.campaign_label ?? '—'}</td>
                    <td className="py-2 text-[11px] text-text-muted">
                      {AD_SPEND_SOURCE_LABEL[r.source ?? 'manual'] ?? r.source}
                    </td>
                    <td className="py-2 text-right font-mono text-text-primary">
                      {formatCents(r.spend_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Subscriptions</h2>
        {subs && subs.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/5">
            {subs.map((s) => {
              const mrr = mrrForSubscription(s);
              return (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-primary">
                        {s.product_name ?? s.price_nickname ?? 'Subscription'}
                      </p>
                      <SubscriptionStatusPill status={s.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {s.unit_amount_cents != null ? formatCents(s.unit_amount_cents) : '—'}
                      {s.interval
                        ? ` / ${s.interval_count && s.interval_count > 1 ? `${s.interval_count} ` : ''}${s.interval}`
                        : ''}
                      {s.current_period_end
                        ? ` · renews ${new Date(s.current_period_end).toLocaleDateString('en-US')}`
                        : ''}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-text-secondary">
                    {formatCents(mrr)} MRR
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-muted">No active subscriptions.</p>
        )}
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Invoices</h2>
        {invoices && invoices.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2 font-medium">Number</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium">Due</th>
                  <th className="py-2 font-medium">Paid</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2 font-mono text-[12px] text-text-secondary">
                      {inv.number ?? '—'}
                    </td>
                    <td className="py-2">
                      <InvoiceStatusPill status={inv.status} />
                    </td>
                    <td className="py-2 text-right font-mono text-text-primary">
                      {formatCents(inv.amount_due_cents, inv.currency)}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US') : '—'}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-US') : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-3 text-[11px]">
                        {inv.hosted_invoice_url ? (
                          <a
                            href={inv.hosted_invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-nz-cyan hover:text-nz-cyan/80"
                          >
                            <ExternalLink size={12} /> View / pay
                          </a>
                        ) : null}
                        {inv.invoice_pdf ? (
                          <a
                            href={inv.invoice_pdf}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary"
                          >
                            <FileDown size={12} /> PDF
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-muted">No invoices yet.</p>
        )}
      </section>
    </div>
  );
}
