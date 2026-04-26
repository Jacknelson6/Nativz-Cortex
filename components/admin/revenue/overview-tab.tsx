import { Suspense } from 'react';
import { TrendingUp, Wallet, AlertTriangle, Repeat, DollarSign, Clock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents, formatCentsCompact } from '@/lib/format/money';
import { netLifetimeRevenueCents } from '@/lib/revenue/aggregates';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { KpiTile } from './kpi-tile';

/**
 * Revenue overview tab — five independent Suspense boundaries so the
 * shell paints instantly and each card streams in as its own query
 * resolves. Previously the entire tab blocked on Promise.all of seven
 * Supabase queries; if any one of them was slow (typically the
 * `client_lifecycle_events` scan), the four KPIs at the top sat
 * invisible until everything finished.
 *
 * Each child component is its own async server component so React's
 * streaming SSR can flush its HTML the moment that one query resolves.
 * Skeletons match the live component dimensions so layout doesn't
 * shift when the real markup lands.
 */
export function RevenueOverviewTab() {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <HasStripeDataBanner />
      </Suspense>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<KpiSkeleton />}>
          <MrrTile />
        </Suspense>
        <Suspense fallback={<KpiSkeleton />}>
          <ActiveSubsTile />
        </Suspense>
        <Suspense fallback={<KpiSkeleton />}>
          <RevenueTile />
        </Suspense>
        <Suspense fallback={<KpiSkeleton />}>
          <OpenArTile />
        </Suspense>
      </div>

      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <header className="flex items-center gap-2">
          <Clock size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-text-primary">Recent activity</h2>
        </header>
        <Suspense fallback={<ActivityFeedSkeleton />}>
          <RecentActivity />
        </Suspense>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Streaming children
// ────────────────────────────────────────────────────────────────────────

async function MrrTile() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('clients')
    .select('mrr_cents')
    .not('mrr_cents', 'is', null);
  const mrrCents = (data ?? []).reduce((s, r) => s + (r.mrr_cents ?? 0), 0);
  return (
    <KpiTile
      label="MRR"
      value={formatCentsCompact(mrrCents)}
      sub={`ARR ${formatCentsCompact(mrrCents * 12)}`}
      tone="brand"
      icon={<TrendingUp size={14} aria-hidden />}
    />
  );
}

async function ActiveSubsTile() {
  const admin = createAdminClient();
  const { count } = await admin
    .from('stripe_subscriptions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['active', 'trialing', 'past_due']);
  return (
    <KpiTile
      label="Active subs"
      value={count ?? 0}
      sub="Includes past due + trialing"
      tone="neutral"
      icon={<Repeat size={14} aria-hidden />}
    />
  );
}

async function RevenueTile() {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  // Both windows share the same source table — fire in parallel within
  // this boundary so MTD + YTD land together without dragging the rest
  // of the strip.
  const [mtdCents, ytdCents] = await Promise.all([
    netLifetimeRevenueCents(admin, { since: monthStart }),
    netLifetimeRevenueCents(admin, { since: yearStart }),
  ]);
  return (
    <KpiTile
      label="Revenue (MTD)"
      value={formatCents(mtdCents)}
      sub={`YTD ${formatCentsCompact(ytdCents)}`}
      tone="good"
      icon={<DollarSign size={14} aria-hidden />}
    />
  );
}

async function OpenArTile() {
  const admin = createAdminClient();
  const [openInvoices, overdueInvoices] = await Promise.all([
    admin.from('stripe_invoices').select('id, amount_remaining_cents').eq('status', 'open'),
    admin
      .from('stripe_invoices')
      .select('id, amount_remaining_cents, due_date')
      .eq('status', 'open')
      .lt('due_date', new Date().toISOString()),
  ]);
  const arOpen = (openInvoices.data ?? []).reduce(
    (s, r) => s + (r.amount_remaining_cents ?? 0),
    0,
  );
  const arOverdue = (overdueInvoices.data ?? []).reduce(
    (s, r) => s + (r.amount_remaining_cents ?? 0),
    0,
  );
  return (
    <KpiTile
      label="Open AR"
      value={formatCents(arOpen)}
      sub={arOverdue > 0 ? `${formatCents(arOverdue)} overdue` : 'All current'}
      tone={arOverdue > 0 ? 'warn' : 'neutral'}
      icon={<Wallet size={14} aria-hidden />}
    />
  );
}

async function RecentActivity() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_lifecycle_events')
    .select('id, client_id, type, title, occurred_at, clients(name, slug)')
    .order('occurred_at', { ascending: false })
    .limit(15);

  if (!data || data.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
        <AlertTriangle size={14} aria-hidden /> No activity yet.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-white/5">
      {data.map((evt) => {
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
            <time
              className="shrink-0 text-[11px] text-text-muted"
              dateTime={evt.occurred_at}
              title={new Date(evt.occurred_at).toLocaleString()}
            >
              {formatRelative(evt.occurred_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Lightweight existence check — only paints the "no Stripe data yet"
 * banner if the workspace really has nothing yet. Two `head: true`
 * count queries are cheap enough to keep on the streaming critical
 * path without dragging the KPI strip.
 */
async function HasStripeDataBanner() {
  const admin = createAdminClient();
  const [clients, invoices] = await Promise.all([
    admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('mrr_cents', 'is', null),
    admin
      .from('stripe_invoices')
      .select('id', { count: 'exact', head: true })
      .limit(1),
  ]);
  const hasData = (clients.count ?? 0) > 0 || (invoices.count ?? 0) > 0;
  if (hasData) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
      <p className="font-medium">No Stripe data yet.</p>
      <p className="mt-1 text-amber-200/80">
        Run <code className="rounded bg-black/30 px-1 py-0.5">npm run revenue:backfill</code> to
        import existing customers, invoices, and subscriptions. New events stream in live via the{' '}
        <code className="rounded bg-black/30 px-1 py-0.5">/api/webhooks/stripe</code> endpoint.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Skeleton fallbacks — match KpiTile + activity-row shape so the layout
// doesn't snap when the real content lands.
// ────────────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <SkeletonGroup className="rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-7 w-24" />
      <Skeleton className="mt-2 h-3 w-20" />
    </SkeletonGroup>
  );
}

function ActivityFeedSkeleton() {
  return (
    <SkeletonGroup className="mt-4 space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </SkeletonGroup>
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
