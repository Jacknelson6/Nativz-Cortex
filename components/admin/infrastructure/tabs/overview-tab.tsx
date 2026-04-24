/**
 * Infrastructure › Overview — command center.
 *
 * Three decks, top → bottom:
 *   1. Money strip — 24h / 30d spend + searches in flight + active clients.
 *   2. Subsystem tiles — one per infrastructure tab. Each tile now carries
 *      a real traffic-light state (green / amber / red / grey) computed
 *      from recent telemetry, plus a tiny 7-day sparkline for the primary
 *      metric so trends are visible at a glance without opening the tab.
 *   3. Recent failures — last-24h failed topic searches, apify runs, and
 *      cron runs (progressive disclosure — summary stays scannable, details
 *      open on click).
 */

import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  Activity,
  AlertTriangle,
  Database,
  DollarSign,
  Gauge,
  Layers,
  Plug,
  Server,
  Sliders,
  Zap,
} from 'lucide-react';
import { HealthDot, Stat } from '../stat';
import { Disclosure } from '../section-card';
import { INFRA_CACHE_TAG } from '../cache';
import { Sparkline } from '../sparkline';
import type { SubsystemState } from '../subsystem-state';

interface SubsystemRollup {
  slug: string;
  name: string;
  href: string;
  state: SubsystemState;
  primary: string;
  secondary?: string;
  /** 7-day daily series for this subsystem's primary metric, oldest → newest. Omit when we have no meaningful series. */
  series?: number[];
  seriesLabel?: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface FailureRow {
  kind: 'search' | 'apify' | 'cron';
  label: string;
  detail: string;
  at: string;
  id: string;
}

/**
 * Bucket row timestamps into the trailing 7 days (oldest → newest) so we
 * can feed the Sparkline component one number per day. Any row with a
 * numeric value (cost, etc.) sums; null/undefined treats each row as
 * count=1 so success-rate sparklines still work.
 */
function bucketByDay<T>(
  rows: T[],
  getIso: (row: T) => string | null | undefined,
  getValue?: (row: T) => number,
): number[] {
  const buckets = new Array<number>(7).fill(0);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Bucket 0 = 6 days ago, bucket 6 = today.
  for (const row of rows) {
    const iso = getIso(row);
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) continue;
    const daysAgo = Math.floor((now - t) / dayMs);
    if (daysAgo < 0 || daysAgo > 6) continue;
    const idx = 6 - daysAgo;
    buckets[idx] += getValue ? getValue(row) : 1;
  }
  return buckets;
}

const getOverviewData = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [
      topic,
      cron,
      benchmarks,
      clients,
      apify24h,
      apify7d,
      apify30d,
      ai24h,
      ai7d,
      ai30d,
      apifyStatus7d,
      inFlight,
      failedSearches,
      failedApify,
      socialProfiles,
    ] = await Promise.all([
      admin
        .from('topic_searches')
        .select('status, created_at')
        .gte('created_at', sevenDaysAgo)
        .limit(500),
      admin
        .from('cron_runs')
        .select('route, status, started_at, error')
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: false })
        .limit(500),
      admin
        .from('client_benchmarks')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      admin.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('apify_runs').select('cost_usd').gte('started_at', twentyFourHoursAgo),
      admin.from('apify_runs').select('cost_usd, started_at').gte('started_at', sevenDaysAgo),
      admin.from('apify_runs').select('cost_usd, started_at').gte('started_at', thirtyDaysAgo),
      admin.from('api_usage_logs').select('cost_usd').gte('created_at', twentyFourHoursAgo),
      admin.from('api_usage_logs').select('cost_usd, created_at').gte('created_at', sevenDaysAgo),
      admin.from('api_usage_logs').select('cost_usd, created_at').gte('created_at', thirtyDaysAgo),
      admin.from('apify_runs').select('status, started_at').gte('started_at', sevenDaysAgo).limit(500),
      admin.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      admin
        .from('topic_searches')
        .select('id, query, pipeline_state, created_at')
        .eq('status', 'failed')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(10),
      admin
        .from('apify_runs')
        .select('run_id, actor_id, error, started_at, status')
        .in('status', ['FAILED', 'ABORTED', 'TIMED-OUT', 'START_FAILED'])
        .gte('started_at', twentyFourHoursAgo)
        .order('started_at', { ascending: false })
        .limit(10),
      admin.from('social_profiles').select('status').limit(200),
    ]);

    const sumCost = (rows: { cost_usd: number | string | null }[] | null): number =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

    const failures: FailureRow[] = [];
    for (const r of failedSearches.data ?? []) {
      const row = r as {
        id: string;
        query: string | null;
        pipeline_state: { error?: string; last_error?: string } | null;
        created_at: string;
      };
      const detail =
        row.pipeline_state?.error ??
        row.pipeline_state?.last_error ??
        'Search failed — open report for stage details';
      failures.push({
        kind: 'search',
        label: row.query?.slice(0, 64) ?? 'Topic search',
        detail: detail.slice(0, 160),
        at: row.created_at,
        id: `search-${row.id}`,
      });
    }
    for (const r of failedApify.data ?? []) {
      const row = r as {
        run_id: string;
        actor_id: string | null;
        error: string | null;
        started_at: string;
        status: string | null;
      };
      failures.push({
        kind: 'apify',
        label: row.actor_id ?? 'actor',
        detail: (row.error ?? row.status ?? 'failed').slice(0, 160),
        at: row.started_at,
        id: `apify-${row.run_id}`,
      });
    }
    for (const r of cron.data ?? []) {
      if (r.status !== 'ok') {
        const row = r as { route: string; status: string | null; error: string | null; started_at: string };
        failures.push({
          kind: 'cron',
          label: row.route,
          detail: (row.error ?? row.status ?? 'unknown').slice(0, 160),
          at: row.started_at,
          id: `cron-${row.route}-${row.started_at}`,
        });
      }
    }
    failures.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      topicRuns: topic.data ?? [],
      cronRuns: cron.data ?? [],
      activeBenchmarks: benchmarks.count ?? 0,
      activeClients: clients.count ?? 0,
      apifyCost24h: sumCost(apify24h.data as { cost_usd: number | string | null }[] | null),
      apifyCost30d: sumCost(apify30d.data as { cost_usd: number | string | null }[] | null),
      apify7d: (apify7d.data ?? []) as { cost_usd: number | string | null; started_at: string }[],
      apifyStatus7d: (apifyStatus7d.data ?? []) as { status: string | null; started_at: string }[],
      aiCost24h: sumCost(ai24h.data as { cost_usd: number | string | null }[] | null),
      aiCost30d: sumCost(ai30d.data as { cost_usd: number | string | null }[] | null),
      ai7d: (ai7d.data ?? []) as { cost_usd: number | string | null; created_at: string }[],
      searchesInFlight: inFlight.count ?? 0,
      failures: failures.slice(0, 20),
      socialProfiles: (socialProfiles.data ?? []) as { status: string | null }[],
    };
  },
  ['infrastructure-overview-rollup'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Health heuristic. Favors false-positive "degraded" over optimistic green:
 * > 20% failure = error, > 5% = degraded, zero runs = unknown.
 */
function healthFromFailureRate(total: number, failed: number): SubsystemState {
  if (total === 0) return 'unknown';
  const rate = failed / total;
  if (rate > 0.2) return 'error';
  if (rate > 0.05) return 'degraded';
  return 'healthy';
}

export async function OverviewTab() {
  const data = await getOverviewData();

  // ── Per-subsystem signals ───────────────────────────────────────────────
  const topicFailed = data.topicRuns.filter((r) => r.status === 'failed').length;
  const topicState = healthFromFailureRate(data.topicRuns.length, topicFailed);
  const topicFailureRate = data.topicRuns.length ? topicFailed / data.topicRuns.length : 0;
  const topicSeries = bucketByDay(
    data.topicRuns as { created_at: string }[],
    (r) => r.created_at,
  );

  const cronFailures = data.cronRuns.filter((r) => r.status !== 'ok').length;
  const cronState = healthFromFailureRate(data.cronRuns.length, cronFailures);
  const cronSeries = bucketByDay(
    data.cronRuns as { started_at: string }[],
    (r) => r.started_at,
  );

  const apifyFailed = data.apifyStatus7d.filter(
    (r) => r.status && ['FAILED', 'ABORTED', 'TIMED-OUT', 'START_FAILED'].includes(r.status),
  ).length;
  const apifyState = healthFromFailureRate(data.apifyStatus7d.length, apifyFailed);
  const apifySeries = bucketByDay(
    data.apify7d,
    (r) => r.started_at,
    (r) => Number(r.cost_usd ?? 0),
  );

  const aiSeries = bucketByDay(
    data.ai7d,
    (r) => r.created_at,
    (r) => Number(r.cost_usd ?? 0),
  );
  const aiState: SubsystemState =
    data.aiCost30d === 0 ? 'unknown' : 'healthy';

  const integrationsDown = data.socialProfiles.filter(
    (p) => p.status && ['error', 'disconnected', 'expired', 'revoked'].includes(p.status),
  ).length;
  const integrationsState: SubsystemState =
    data.socialProfiles.length === 0
      ? 'unknown'
      : integrationsDown === 0
        ? 'healthy'
        : integrationsDown <= 2
          ? 'degraded'
          : 'error';

  const rollups: SubsystemRollup[] = [
    {
      slug: 'compute',
      name: 'Vercel',
      href: '/admin/infrastructure?tab=compute',
      state: cronState,
      primary: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
      secondary:
        data.cronRuns.length > 0
          ? cronFailures === 0
            ? `${data.cronRuns.length} runs · healthy`
            : `${cronFailures} failures / ${data.cronRuns.length} runs`
          : 'Vercel + crons',
      series: cronSeries,
      seriesLabel: 'Cron runs, last 7 days',
      Icon: Server,
    },
    {
      slug: 'database',
      name: 'Database',
      href: '/admin/infrastructure?tab=database',
      state: 'healthy',
      primary: `${data.activeClients} active clients`,
      secondary: `${data.activeBenchmarks} benchmarks · Supabase US West`,
      Icon: Database,
    },
    {
      slug: 'pipelines',
      name: 'Pipelines',
      href: '/admin/infrastructure?tab=pipelines',
      state: topicState,
      primary: `${data.topicRuns.length} runs (7d)`,
      secondary:
        data.topicRuns.length > 0
          ? `${Math.round(topicFailureRate * 100)}% failure · ${data.searchesInFlight} in flight`
          : 'No runs yet',
      series: topicSeries,
      seriesLabel: 'Topic searches, last 7 days',
      Icon: Gauge,
    },
    {
      slug: 'ai',
      name: 'AI',
      href: '/admin/infrastructure?tab=ai',
      state: aiState,
      primary: `${formatUsd(data.aiCost30d)} (30d)`,
      secondary:
        data.aiCost24h > 0
          ? `${formatUsd(data.aiCost24h)} last 24h · OpenRouter`
          : 'OpenRouter + direct providers',
      series: aiSeries,
      seriesLabel: 'AI spend, last 7 days',
      Icon: Layers,
    },
    {
      slug: 'apify',
      name: 'Scrapers',
      href: '/admin/infrastructure?tab=apify',
      state: apifyState,
      primary: `${formatUsd(data.apifyCost30d)} (30d)`,
      secondary:
        data.apifyStatus7d.length > 0
          ? `${apifyFailed} failures / ${data.apifyStatus7d.length} runs (7d)`
          : 'Apify actors · cost + account',
      series: apifySeries,
      seriesLabel: 'Apify spend, last 7 days',
      Icon: Zap,
    },
    {
      slug: 'trend-finder',
      name: 'Trend finder',
      href: '/admin/infrastructure?tab=trend-finder',
      state: 'healthy',
      primary: 'Scrape volume knobs',
      secondary: 'Per-platform counts + cost estimator',
      Icon: Sliders,
    },
    {
      slug: 'integrations',
      name: 'Integrations',
      href: '/admin/infrastructure?tab=integrations',
      state: integrationsState,
      primary:
        data.socialProfiles.length > 0
          ? `${data.socialProfiles.length - integrationsDown} / ${data.socialProfiles.length} connected`
          : '11 services wired',
      secondary:
        integrationsDown > 0
          ? `${integrationsDown} need attention`
          : 'Zernio · OpenRouter · Gemini · Nango',
      Icon: Plug,
    },
    {
      slug: 'agent-loops',
      name: 'Agent sessions',
      href: '/admin/analytics',
      state: 'unknown',
      primary: 'Soon',
      secondary: 'Nerd + SRL telemetry',
      Icon: Activity,
    },
  ];

  const totalCost24h = data.apifyCost24h + data.aiCost24h;
  const totalCost30d = data.apifyCost30d + data.aiCost30d;
  const projectedMonthly = totalCost30d;
  const sevenDayRuns = data.topicRuns.length;
  const sevenDaySuccessPct = sevenDayRuns
    ? Math.round(
        (data.topicRuns.filter((r) => r.status === 'completed').length / sevenDayRuns) * 100,
      )
    : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        At-a-glance health for every subsystem Cortex runs on. Green is healthy, amber is
        degraded, red needs attention. Click a tile to drill in.
      </p>

      <section className="rounded-2xl border border-nativz-border bg-surface/60 p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
            <DollarSign size={14} />
          </span>
          <h2 className="text-sm font-semibold text-text-primary">Command center</h2>
          <span className="text-[12px] text-text-muted">· live spend + activity</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Spend / 24h"
            value={formatUsd(totalCost24h)}
            sub={`Apify ${formatUsd(data.apifyCost24h)} · AI ${formatUsd(data.aiCost24h)}`}
          />
          <Stat
            label="Projected / month"
            value={formatUsd(projectedMonthly)}
            sub={`Trailing 30d · ${formatUsd(totalCost30d)} spent`}
          />
          <Stat
            label="Searches in flight"
            value={`${data.searchesInFlight}`}
            sub={`${sevenDayRuns} runs / 7d · ${sevenDaySuccessPct}% success`}
          />
          <Stat
            label="Active clients"
            value={`${data.activeClients}`}
            sub={`${data.activeBenchmarks} active benchmarks`}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rollups.map((r) => (
          <Link
            key={r.slug}
            href={r.href}
            className="group relative overflow-hidden rounded-xl border border-nativz-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-hover/30"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text">
                <r.Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary truncate">{r.name}</h3>
                    <HealthDot state={r.state} />
                  </div>
                  {r.series && (
                    <Sparkline
                      data={r.series}
                      state={r.state}
                      width={72}
                      ariaLabel={r.seriesLabel}
                    />
                  )}
                </div>
                <div className="mt-1 truncate text-sm tabular-nums text-text-primary">
                  {r.primary}
                </div>
                {r.secondary && (
                  <div className="mt-0.5 truncate text-[12px] text-text-muted">{r.secondary}</div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {data.failures.length > 0 ? (
        <Disclosure
          summary="Recent failures · last 24h"
          count={data.failures.length}
          defaultOpen={data.failures.length <= 3}
        >
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-nativz-border/40 pb-2 text-[12px] font-mono uppercase tracking-[0.18em] text-text-muted">
            <span>Kind</span>
            <span>What failed</span>
            <span className="text-right">When</span>
          </div>
          {data.failures.map((f) => (
            <div
              key={f.id}
              className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-nativz-border/40 py-2 text-sm last:border-b-0"
            >
              <FailureKindPill kind={f.kind} />
              <div className="min-w-0">
                <div className="truncate text-text-primary">{f.label}</div>
                <div className="truncate text-[12px] text-coral-300/90">{f.detail}</div>
              </div>
              <span className="shrink-0 text-right text-[12px] tabular-nums text-text-muted">
                {formatAge(f.at)}
              </span>
            </div>
          ))}
        </Disclosure>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-nativz-border bg-surface px-4 py-3 text-sm text-text-muted">
          <AlertTriangle size={14} className="text-emerald-300" />
          No failures in the last 24 hours.
        </div>
      )}
    </div>
  );
}

function FailureKindPill({ kind }: { kind: FailureRow['kind'] }) {
  const map = {
    search: { label: 'search', tone: 'bg-accent/10 text-accent-text' },
    apify: { label: 'apify', tone: 'bg-amber-500/10 text-amber-300' },
    cron: { label: 'cron', tone: 'bg-nz-purple/15 text-nz-purple-100' },
  } as const;
  const entry = map[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[12px] uppercase tracking-wide ${entry.tone}`}
    >
      {entry.label}
    </span>
  );
}
