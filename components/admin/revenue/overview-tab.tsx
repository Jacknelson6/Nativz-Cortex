import { TrendingUp, Wallet, AlertTriangle, Repeat, DollarSign, Clock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents, formatCentsCompact } from '@/lib/format/money';
import { KpiTile } from './kpi-tile';

export async function RevenueOverviewTab() {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const [
    mrrAgg,
    activeSubsCount,
    paidMtd,
    paidYtd,
    openInvoices,
    overdueInvoices,
    recentEvents,
  ] = await Promise.all([
    admin.from('clients').select('mrr_cents').not('mrr_cents', 'is', null),
    admin
      .from('stripe_subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'trialing', 'past_due']),
    admin.from('stripe_invoices').select('amount_paid_cents').gte('paid_at', monthStart),
    admin.from('stripe_invoices').select('amount_paid_cents').gte('paid_at', yearStart),
    admin.from('stripe_invoices').select('id, amount_remaining_cents').eq('status', 'open'),
    admin
      .from('stripe_invoices')
      .select('id, amount_remaining_cents, due_date')
      .eq('status', 'open')
      .lt('due_date', new Date().toISOString()),
    admin
      .from('client_lifecycle_events')
      .select('id, client_id, type, title, occurred_at, clients(name, slug)')
      .order('occurred_at', { ascending: false })
      .limit(15),
  ]);

  const mrrCents = (mrrAgg.data ?? []).reduce((s, r) => s + (r.mrr_cents ?? 0), 0);
  const mtdCents = (paidMtd.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const ytdCents = (paidYtd.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const arOpen = (openInvoices.data ?? []).reduce((s, r) => s + (r.amount_remaining_cents ?? 0), 0);
  const arOverdue = (overdueInvoices.data ?? []).reduce(
    (s, r) => s + (r.amount_remaining_cents ?? 0),
    0,
  );

  const hasStripeData = (mrrAgg.data?.length ?? 0) > 0 || mtdCents > 0 || (openInvoices.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {!hasStripeData ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <p className="font-medium">No Stripe data yet.</p>
          <p className="mt-1 text-amber-200/80">
            Run <code className="rounded bg-black/30 px-1 py-0.5">npm run revenue:backfill</code> to
            import existing customers, invoices, and subscriptions. New events stream in live via
            the <code className="rounded bg-black/30 px-1 py-0.5">/api/webhooks/stripe</code>{' '}
            endpoint.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="MRR"
          value={formatCentsCompact(mrrCents)}
          sub={`ARR ${formatCentsCompact(mrrCents * 12)}`}
          tone="brand"
          icon={<TrendingUp size={14} />}
        />
        <KpiTile
          label="Active subs"
          value={activeSubsCount.count ?? 0}
          sub="Includes past due + trialing"
          tone="neutral"
          icon={<Repeat size={14} />}
        />
        <KpiTile
          label="Revenue (MTD)"
          value={formatCents(mtdCents)}
          sub={`YTD ${formatCentsCompact(ytdCents)}`}
          tone="good"
          icon={<DollarSign size={14} />}
        />
        <KpiTile
          label="Open AR"
          value={formatCents(arOpen)}
          sub={arOverdue > 0 ? `${formatCents(arOverdue)} overdue` : 'All current'}
          tone={arOverdue > 0 ? 'warn' : 'neutral'}
          icon={<Wallet size={14} />}
        />
      </div>

      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <header className="flex items-center gap-2">
          <Clock size={14} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Recent activity</h2>
        </header>
        {recentEvents.data && recentEvents.data.length > 0 ? (
          <ul className="mt-4 divide-y divide-white/5">
            {recentEvents.data.map((evt) => {
              const client = evt.clients as { name?: string | null; slug?: string | null } | null;
              return (
                <li key={evt.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{evt.title}</p>
                    <p className="truncate text-[11px] text-text-muted">
                      <span className="font-mono">{evt.type}</span>
                      {client?.name ? <span> · {client.name}</span> : null}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-text-muted">
                    {formatRelative(evt.occurred_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
            <AlertTriangle size={14} /> No activity yet.
          </p>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
