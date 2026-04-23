import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Activity, Database, DollarSign, Gauge, Layers, Plug, Timer } from 'lucide-react';
import { HealthDot, Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';

type SubsystemState = 'healthy' | 'degraded' | 'error' | 'unknown';

interface SubsystemRollup {
  slug: string;
  name: string;
  href: string;
  state: SubsystemState;
  primary: string;
  secondary?: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const getOverviewData = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [topic, cron, benchmarks, clients, apify24h, apify30d, ai24h, ai30d, inFlight] =
      await Promise.all([
        admin
          .from('topic_searches')
          .select('status', { count: 'exact', head: false })
          .gte('created_at', sevenDaysAgo)
          .limit(500),
        admin
          .from('cron_runs')
          .select('route, status, started_at')
          .gte('started_at', sevenDaysAgo)
          .order('started_at', { ascending: false })
          .limit(200),
        admin
          .from('client_benchmarks')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        admin.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
        admin
          .from('apify_runs')
          .select('cost_usd')
          .gte('started_at', twentyFourHoursAgo),
        admin
          .from('apify_runs')
          .select('cost_usd, started_at')
          .gte('started_at', thirtyDaysAgo),
        admin
          .from('api_usage_logs')
          .select('cost_usd')
          .gte('created_at', twentyFourHoursAgo),
        admin
          .from('api_usage_logs')
          .select('cost_usd, created_at')
          .gte('created_at', thirtyDaysAgo),
        admin
          .from('topic_searches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing'),
      ]);

    const sumCost = (rows: { cost_usd: number | string | null }[] | null): number =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

    return {
      topicRuns: topic.data ?? [],
      cronRuns: cron.data ?? [],
      activeBenchmarks: benchmarks.count ?? 0,
      activeClients: clients.count ?? 0,
      apifyCost24h: sumCost(apify24h.data as { cost_usd: number | string | null }[] | null),
      apifyCost30d: sumCost(apify30d.data as { cost_usd: number | string | null }[] | null),
      aiCost24h: sumCost(ai24h.data as { cost_usd: number | string | null }[] | null),
      aiCost30d: sumCost(ai30d.data as { cost_usd: number | string | null }[] | null),
      searchesInFlight: inFlight.count ?? 0,
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

export async function OverviewTab() {
  const data = await getOverviewData();

  const topicFailureRate = data.topicRuns.length
    ? data.topicRuns.filter((r) => r.status === 'failed').length / data.topicRuns.length
    : 0;
  const topicState: SubsystemState = data.topicRuns.length === 0
    ? 'unknown'
    : topicFailureRate > 0.2
      ? 'error'
      : topicFailureRate > 0.05
        ? 'degraded'
        : 'healthy';

  const cronFailures = data.cronRuns.filter((r) => r.status !== 'ok').length;
  const cronState: SubsystemState = data.cronRuns.length === 0
    ? 'unknown'
    : cronFailures > 0
      ? cronFailures > 3 ? 'error' : 'degraded'
      : 'healthy';

  const rollups: SubsystemRollup[] = [
    {
      slug: 'topic-search',
      name: 'Topic search',
      href: '/admin/infrastructure?tab=topic-search',
      state: topicState,
      primary: `${data.topicRuns.length} runs (7d)`,
      secondary:
        data.topicRuns.length > 0
          ? `${Math.round(topicFailureRate * 100)}% failure rate`
          : 'No runs yet',
      Icon: Gauge,
    },
    {
      slug: 'ai-providers',
      name: 'AI providers',
      href: '/admin/infrastructure?tab=ai-providers',
      state: 'healthy',
      primary: 'Routed via OpenRouter',
      secondary: 'Per-model usage in tab',
      Icon: Layers,
    },
    {
      slug: 'crons',
      name: 'Crons',
      href: '/admin/infrastructure?tab=crons',
      state: cronState,
      primary: `${data.cronRuns.length} runs (7d)`,
      secondary:
        data.cronRuns.length > 0
          ? `${cronFailures} non-ok`
          : 'Telemetry starts on next cron tick',
      Icon: Timer,
    },
    {
      slug: 'integrations',
      name: 'Integrations',
      href: '/admin/infrastructure?tab=integrations',
      state: 'healthy',
      primary: `${data.activeClients} active clients`,
      secondary: 'Zernio · Supabase · OpenRouter · Nango',
      Icon: Plug,
    },
    {
      slug: 'database',
      name: 'Database',
      href: '/admin/infrastructure?tab=database',
      state: 'healthy',
      primary: `${data.activeBenchmarks} active benchmarks`,
      secondary: 'Row counts in tab',
      Icon: Database,
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

  // ── Command-center money strip ──
  //
  // 24h + 30d spend split between Apify (scrapers) and AI (OpenRouter /
  // OpenAI / Gemini / Groq, anything that writes to api_usage_logs). The
  // projected monthly burn extrapolates from the 30d trailing sum — it's
  // a smoother signal than 24h×30 since scrapes are bursty.
  const totalCost24h = data.apifyCost24h + data.aiCost24h;
  const totalCost30d = data.apifyCost30d + data.aiCost30d;
  const projectedMonthly = totalCost30d; // trailing 30d IS a monthly estimate
  const sevenDayRuns = data.topicRuns.length;
  const sevenDaySuccessPct = sevenDayRuns
    ? Math.round(
        (data.topicRuns.filter((r) => r.status === 'completed').length / sevenDayRuns) * 100,
      )
    : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        At-a-glance health for every subsystem Cortex runs on. Click a tile to drill in.
      </p>

      {/* Money + health tiles — the "command center" row */}
      <section className="rounded-2xl border border-nativz-border bg-surface/60 p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300">
            <DollarSign size={14} />
          </span>
          <h2 className="text-sm font-semibold text-text-primary">Command center</h2>
          <span className="text-[11px] text-text-muted">
            · live spend + activity
          </span>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rollups.map((r) => (
          <Link
            key={r.slug}
            href={r.href}
            className="group relative overflow-hidden rounded-xl border border-nativz-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-surface-hover/40"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                <r.Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{r.name}</h3>
                  <HealthDot state={r.state} />
                </div>
                <div className="mt-1 text-sm tabular-nums text-text-primary">{r.primary}</div>
                {r.secondary && (
                  <div className="mt-0.5 text-[11px] text-text-muted">{r.secondary}</div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
