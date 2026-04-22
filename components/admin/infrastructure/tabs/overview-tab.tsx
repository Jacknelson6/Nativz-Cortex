import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Activity, Database, Gauge, Layers, Plug, Timer } from 'lucide-react';
import { HealthDot } from '../stat';
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [topic, cron, benchmarks, clients] = await Promise.all([
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
    ]);

    return {
      topicRuns: topic.data ?? [],
      cronRuns: cron.data ?? [],
      activeBenchmarks: benchmarks.count ?? 0,
      activeClients: clients.count ?? 0,
    };
  },
  ['infrastructure-overview-rollup'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

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

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        At-a-glance health for every subsystem Cortex runs on. Click a tile to drill in.
      </p>
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
