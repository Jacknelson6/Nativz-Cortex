import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents, formatCentsCompact } from '@/lib/format/money';
import { netLifetimeRevenueCents } from '@/lib/revenue/aggregates';
import { mrrForSubscription } from '@/lib/stripe/mrr';
import { KpiTile } from '@/components/admin/revenue/kpi-tile';
import {
  InvoiceStatusPill,
  LifecycleStatePill,
  SubscriptionStatusPill,
} from '@/components/admin/revenue/status-pill';
import { MetaAdsLinkCard } from '@/components/admin/revenue/meta-ads-link-card';

export const dynamic = 'force-dynamic';

export default async function ClientBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) notFound();

  const { data: client } = await admin
    .from('clients')
    .select(
      'id, name, slug, lifecycle_state, mrr_cents, boosting_budget_cents, stripe_customer_id, meta_ad_account_id, meta_ad_spend_synced_at',
    )
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const periodMonth = monthStart.toISOString().slice(0, 10);

  const [
    { data: invoices },
    { data: subs },
    { data: contracts },
    lifetimeCents,
    { data: openArRes },
    { data: adSpendRes },
    { data: events },
  ] = await Promise.all([
    admin
      .from('stripe_invoices')
      .select('id, number, status, amount_due_cents, amount_paid_cents, amount_remaining_cents, currency, due_date, paid_at, hosted_invoice_url, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('stripe_subscriptions')
      .select('id, status, current_period_end, cancel_at_period_end, started_at, product_name, price_nickname, unit_amount_cents, interval, interval_count, quantity, canceled_at')
      .eq('client_id', client.id)
      .order('status')
      .order('started_at', { ascending: false }),
    admin
      .from('client_contracts')
      .select('id, label, status, effective_start, effective_end, external_provider, external_url, sent_at, signed_at, total_cents, deposit_cents')
      .eq('client_id', client.id)
      .order('uploaded_at', { ascending: false }),
    netLifetimeRevenueCents(admin, { clientId: client.id }),
    admin
      .from('stripe_invoices')
      .select('amount_remaining_cents')
      .eq('client_id', client.id)
      .eq('status', 'open'),
    admin.from('client_ad_spend').select('spend_cents').eq('client_id', client.id).eq('period_month', periodMonth),
    admin
      .from('client_lifecycle_events')
      .select('id, type, title, description, occurred_at, metadata')
      .eq('client_id', client.id)
      .order('occurred_at', { ascending: false })
      .limit(30),
  ]);

  const openArCents = (openArRes ?? []).reduce((s, r) => s + (r.amount_remaining_cents ?? 0), 0);
  const adSpendMtdCents = (adSpendRes ?? []).reduce((s, r) => s + (r.spend_cents ?? 0), 0);

  const stripeCustomerDashboardUrl = client.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${client.stripe_customer_id}`
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · billing
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">{client.name}</h1>
            <LifecycleStatePill state={client.lifecycle_state ?? 'lead'} />
          </div>
          <div className="flex items-center gap-2">
            {stripeCustomerDashboardUrl ? (
              <a
                href={stripeCustomerDashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
              >
                <ExternalLink size={12} /> Stripe dashboard
              </a>
            ) : (
              <span className="text-xs text-amber-300">No Stripe customer linked</span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="MRR" value={formatCents(client.mrr_cents ?? 0)} tone="brand" />
        <KpiTile label="Lifetime" value={formatCentsCompact(lifetimeCents)} tone="good" />
        <KpiTile
          label="Open AR"
          value={formatCents(openArCents)}
          tone={openArCents > 0 ? 'warn' : 'neutral'}
        />
        <KpiTile
          label="Ads MTD"
          value={formatCents(adSpendMtdCents)}
          sub={
            client.boosting_budget_cents
              ? `Budget ${formatCents(client.boosting_budget_cents)}`
              : undefined
          }
          tone="neutral"
        />
      </div>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Contracts</h2>
        {contracts && contracts.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/5">
            {contracts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{c.label ?? 'Contract'}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {c.status ?? '—'}
                    {c.external_provider ? ` · ${c.external_provider}` : ''}
                    {c.signed_at
                      ? ` · signed ${new Date(c.signed_at).toLocaleDateString('en-US')}`
                      : c.sent_at
                        ? ` · sent ${new Date(c.sent_at).toLocaleDateString('en-US')}`
                        : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  {c.total_cents ? (
                    <span className="font-mono text-text-secondary">
                      {formatCentsCompact(c.total_cents)}
                    </span>
                  ) : null}
                  {c.external_url ? (
                    <a
                      href={c.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-nz-cyan hover:text-nz-cyan/80"
                    >
                      <ExternalLink size={12} /> Contract
                    </a>
                  ) : null}
                  <Link
                    href={`/admin/clients/${client.slug}/contract`}
                    className="text-text-muted hover:text-text-primary"
                  >
                    Edit →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-muted">
            No contracts on file.{' '}
            <Link
              href={`/admin/clients/${client.slug}/contract`}
              className="text-nz-cyan hover:text-nz-cyan/80"
            >
              Add one
            </Link>
            .
          </p>
        )}
      </section>

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
          <p className="mt-3 text-sm text-text-muted">No subscriptions on this client.</p>
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
                  <th className="py-2 font-medium text-right">Paid</th>
                  <th className="py-2 font-medium">Due</th>
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
                    <td className="py-2 text-right font-mono text-text-secondary">
                      {formatCents(inv.amount_paid_cents, inv.currency)}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US') : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:text-nz-cyan/80"
                        >
                          <ExternalLink size={12} /> Stripe
                        </a>
                      ) : null}
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

      <MetaAdsLinkCard
        clientId={client.id}
        currentAccountId={(client as { meta_ad_account_id?: string | null }).meta_ad_account_id ?? null}
        lastSyncedAt={
          (client as { meta_ad_spend_synced_at?: string | null }).meta_ad_spend_synced_at ?? null
        }
      />

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Lifecycle</h2>
        {events && events.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/5">
            {events.map((evt) => (
              <li key={evt.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{evt.title}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    <span className="font-mono">{evt.type}</span>
                  </p>
                </div>
                <time className="shrink-0 text-[11px] text-text-muted">
                  {new Date(evt.occurred_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-muted">No lifecycle events yet.</p>
        )}
      </section>
    </div>
  );
}
