import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowRight, ArrowUpRight, ChevronRight, Pencil, User as UserIcon } from 'lucide-react';
import { Stat, StatusPill, Meta } from '../stat';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

type StageRow = {
  phase?: string;
  duration_ms?: number;
  tokens?: number;
  error?: boolean | string;
  [key: string]: unknown;
};

type PipelineState = {
  kind?: string;
  web_research_mode?: string;
  platforms_requested?: string[];
  platform_scrapers_ran?: boolean;
  stages?: StageRow[];
  totals?: {
    tokens?: number;
    estimated_cost?: number;
    subtopics?: number;
    research_sources?: number;
    platform_sources?: number;
  };
};

type SearchRow = {
  id: string;
  query: string;
  status: string;
  topic_pipeline: string | null;
  created_at: string;
  completed_at: string | null;
  processing_started_at: string | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  pipeline_state: PipelineState | null;
  created_by: string | null;
};

type UserLite = { id: string; full_name: string | null; email: string | null };

function displayName(u: UserLite | undefined): string {
  if (!u) return '—';
  const name = u.full_name?.trim();
  if (name) return name;
  const email = u.email?.trim();
  if (email) return email.split('@')[0] ?? email;
  return '—';
}

const PHASE_LABELS: Record<string, string> = {
  subtopic_research: 'Subtopic research',
  platform_scrapers: 'Platform scrapers',
  transcribe_all: 'Transcribe TikTok',
  cluster_pillars: 'Cluster pillars',
  merge: 'Merge & ideas',
  merge_retry: 'Merge retry',
};

// Distinct hue per stage so the bar + legend read as real data-viz rather
// than a monochrome ramp. Keeps subtopic_research on the brand accent
// (usually the dominant slice) and fans the rest across a tasteful palette.
const PHASE_TINTS: Record<string, string> = {
  subtopic_research: 'bg-accent',
  platform_scrapers: 'bg-fuchsia-500/85',
  transcribe_all: 'bg-amber-400/90',
  cluster_pillars: 'bg-emerald-400/85',
  merge: 'bg-violet-400/85',
  merge_retry: 'bg-red-500/80',
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function sumStageDurations(stages: StageRow[] | undefined): number {
  if (!stages?.length) return 0;
  return stages.reduce((acc, s) => acc + (typeof s.duration_ms === 'number' ? s.duration_ms : 0), 0);
}

function totalWallClockMs(row: SearchRow): number | null {
  const stageSum = sumStageDurations(row.pipeline_state?.stages);
  if (stageSum > 0) return stageSum;
  if (row.completed_at) {
    return new Date(row.completed_at).getTime() - new Date(row.created_at).getTime();
  }
  return null;
}

function groupStagesByPhase(stages: StageRow[] | undefined) {
  if (!stages?.length) return [] as Array<{ phase: string; total: number; count: number; slowest: number }>;
  const map = new Map<string, { total: number; count: number; slowest: number }>();
  for (const s of stages) {
    if (typeof s.duration_ms !== 'number' || s.duration_ms <= 0) continue;
    const phase = String(s.phase ?? 'unknown');
    const existing = map.get(phase) ?? { total: 0, count: 0, slowest: 0 };
    existing.total += s.duration_ms;
    existing.count += 1;
    existing.slowest = Math.max(existing.slowest, s.duration_ms);
    map.set(phase, existing);
  }
  return [...map.entries()]
    .map(([phase, v]) => ({ phase, ...v }))
    .sort((a, b) => b.total - a.total);
}

function stageBar(stages: StageRow[] | undefined) {
  if (!stages?.length) return [] as Array<{ phase: string; pct: number; ms: number }>;
  const total = sumStageDurations(stages);
  if (total === 0) return [];
  return stages
    .filter((s) => typeof s.duration_ms === 'number' && s.duration_ms > 0)
    .map((s) => ({
      phase: String(s.phase ?? 'unknown'),
      pct: ((s.duration_ms as number) / total) * 100,
      ms: s.duration_ms as number,
    }));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const getRecentRunsCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const searchRes = await admin
      .from('topic_searches')
      .select(
        'id, query, status, topic_pipeline, created_at, completed_at, processing_started_at, tokens_used, estimated_cost, pipeline_state, created_by',
      )
      .eq('topic_pipeline', 'llm_v1')
      .order('created_at', { ascending: false })
      .limit(50);

    // Look up the caller's name/email for every unique created_by in one
    // shot. Avoids embedding a Supabase FK join (keeps the query flat).
    const creatorIds = Array.from(
      new Set((searchRes.data ?? []).map((r) => r.created_by).filter((x): x is string => !!x)),
    );
    const userMap: Record<string, UserLite> = {};
    if (creatorIds.length > 0) {
      const userRes = await admin
        .from('users')
        .select('id, full_name, email')
        .in('id', creatorIds);
      for (const u of (userRes.data ?? []) as UserLite[]) {
        userMap[u.id] = u;
      }
    }
    return { searchRes, userMap };
  },
  ['infrastructure-recent-runs'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

const getWeeklyRollupCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return admin
      .from('topic_searches')
      .select('status, completed_at, processing_started_at, pipeline_state')
      .eq('topic_pipeline', 'llm_v1')
      .gte('created_at', sevenDaysAgo)
      .limit(500);
  },
  ['infrastructure-weekly-rollup'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

const getConfiguredModelsCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    return admin
      .from('agency_settings')
      .select('topic_search_planner_model, topic_search_research_model, topic_search_merger_model')
      .eq('agency', 'nativz')
      .single();
  },
  ['infrastructure-models'],
  { revalidate: 5 * 60, tags: [INFRA_CACHE_TAG] },
);

export async function TopicSearchTab() {
  const [recentResult, weeklyResult, modelsResult] = await Promise.all([
    getRecentRunsCached(),
    getWeeklyRollupCached(),
    getConfiguredModelsCached(),
  ]);

  const rows = (recentResult.searchRes.data ?? []) as SearchRow[];
  const userMap = recentResult.userMap;
  const weekly = (weeklyResult.data ?? []) as Pick<
    SearchRow,
    'status' | 'completed_at' | 'processing_started_at' | 'pipeline_state'
  >[];

  const completedWeek = weekly.filter((r) => r.status === 'completed');
  const failedWeek = weekly.filter((r) => r.status === 'failed').length;

  const totalTimes = completedWeek
    .map((r) => sumStageDurations(r.pipeline_state?.stages))
    .filter((n) => n > 0);
  const avgTotal = totalTimes.length
    ? totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length
    : null;

  const mergeTimes = completedWeek
    .flatMap((r) => r.pipeline_state?.stages ?? [])
    .filter((s) => s.phase === 'merge' && typeof s.duration_ms === 'number')
    .map((s) => s.duration_ms as number);
  const avgMerge = mergeTimes.length
    ? mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length
    : null;

  const subtopicTimes = completedWeek
    .flatMap((r) => r.pipeline_state?.stages ?? [])
    .filter((s) => s.phase === 'subtopic_research' && typeof s.duration_ms === 'number')
    .map((s) => s.duration_ms as number);
  const avgSubtopic = subtopicTimes.length
    ? subtopicTimes.reduce((a, b) => a + b, 0) / subtopicTimes.length
    : null;

  const models = modelsResult.data ?? null;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Completed (7d)" value={String(completedWeek.length)} />
        <Stat
          label="Failed (7d)"
          value={String(failedWeek)}
          sub={weekly.length ? `${Math.round((failedWeek / weekly.length) * 100)}% failure rate` : undefined}
        />
        <Stat label="Avg total time" value={formatMs(avgTotal)} sub="sum of stage durations" />
        <Stat
          label="Avg merge stage"
          value={formatMs(avgMerge)}
          sub={avgSubtopic != null ? `subtopic avg: ${formatMs(avgSubtopic)}` : undefined}
        />
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Configured models
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/settings/ai"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-text transition-colors hover:bg-accent/15"
            >
              <Pencil size={12} />
              Edit models
            </Link>
            <Link
              href="/admin/infrastructure?tab=ai"
              className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-nativz-border/90 hover:text-text-primary"
            >
              <ArrowUpRight size={12} />
              AI usage
            </Link>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <ModelRow label="Planner" value={models?.topic_search_planner_model} />
          <ModelRow label="Research" value={models?.topic_search_research_model} />
          <ModelRow label="Merger" value={models?.topic_search_merger_model} />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Recent runs ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
            No LLM v1 topic search runs yet. Run a search from{' '}
            <Link href="/admin/search/new" className="underline decoration-dotted">Trend Finder</Link> to see telemetry here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
            {rows.map((row) => {
              const total = totalWallClockMs(row);
              const stages = row.pipeline_state?.stages;
              const bar = stageBar(stages);
              const grouped = groupStagesByPhase(stages);
              const creator = row.created_by ? userMap[row.created_by] : undefined;
              return (
                <details
                  key={row.id}
                  className="group border-b border-nativz-border/60 last:border-b-0 open:bg-surface-hover/40"
                >
                  <summary className="flex cursor-pointer items-center gap-4 px-4 py-3 text-sm hover:bg-surface-hover/40">
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-text-muted transition-transform group-open:rotate-90"
                    />
                    <span className="w-20 shrink-0 text-xs tabular-nums text-text-muted">
                      {timeAgo(row.created_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {row.query}
                    </span>
                    <StatusPill status={row.status} />
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-muted">
                      {formatMs(total)}
                    </span>
                    <span className="hidden w-36 shrink-0 items-center justify-end gap-1.5 truncate text-right text-xs text-text-muted md:inline-flex">
                      <UserIcon size={11} className="shrink-0 opacity-70" />
                      <span className="truncate">{displayName(creator)}</span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-nativz-border/60 px-4 py-4">
                    {bar.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex h-2 overflow-hidden rounded-full bg-surface-hover">
                          {bar.map((seg, i) => (
                            <div
                              key={i}
                              className={PHASE_TINTS[seg.phase] ?? 'bg-text-muted/30'}
                              style={{ width: `${seg.pct}%` }}
                              title={`${PHASE_LABELS[seg.phase] ?? seg.phase} — ${formatMs(seg.ms)}`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-muted">
                          {grouped.map((g) => (
                            <span key={g.phase} className="inline-flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${PHASE_TINTS[g.phase] ?? 'bg-text-muted/30'}`} />
                              <span className="text-text-secondary">{PHASE_LABELS[g.phase] ?? g.phase}</span>
                              <span className="tabular-nums">{formatMs(g.total)}</span>
                              {g.count > 1 && (
                                <span className="text-text-muted/70">
                                  · {g.count}× · slowest {formatMs(g.slowest)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No stage timings recorded for this run.</p>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                      <Meta label="Pipeline" value={row.topic_pipeline ?? '—'} />
                      <Meta label="Web mode" value={row.pipeline_state?.web_research_mode ?? '—'} />
                      <Meta label="Tokens" value={(row.tokens_used ?? row.pipeline_state?.totals?.tokens ?? 0).toLocaleString()} />
                      <Meta
                        label="Cost"
                        value={
                          row.estimated_cost != null
                            ? `$${row.estimated_cost.toFixed(4)}`
                            : row.pipeline_state?.totals?.estimated_cost != null
                              ? `$${row.pipeline_state.totals.estimated_cost.toFixed(4)}`
                              : '—'
                        }
                      />
                      <Meta label="Subtopics" value={String(row.pipeline_state?.totals?.subtopics ?? '—')} />
                      <Meta label="Research sources" value={String(row.pipeline_state?.totals?.research_sources ?? '—')} />
                      <Meta label="Platform sources" value={String(row.pipeline_state?.totals?.platform_sources ?? '—')} />
                      <Meta label="Search ID" value={row.id.slice(0, 8)} mono />
                    </div>

                    {stages && stages.length > 0 && (
                      <details className="group/inner">
                        <summary className="cursor-pointer text-xs text-text-muted underline decoration-dotted">
                          Raw stage rows ({stages.length})
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-nativz-ink-2/60 p-3 text-[12px] leading-relaxed text-text-muted">
                          {JSON.stringify(stages, null, 2)}
                        </pre>
                      </details>
                    )}

                    <div>
                      <Link
                        href={`/admin/search/${row.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent/15"
                      >
                        Open report
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ModelRow({ label, value }: { label: string; value?: string | null }) {
  const slash = value?.indexOf('/') ?? -1;
  const provider = value && slash > 0 ? value.slice(0, slash) : null;
  const model = value && slash > 0 ? value.slice(slash + 1) : value;
  return (
    <div className="rounded-lg border border-nativz-border/60 bg-surface-hover/30 px-3 py-2.5 transition-colors hover:border-nativz-border/90">
      <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      {value ? (
        <div className="mt-1.5 flex items-center gap-2">
          {provider && (
            <span className="inline-flex shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-[1px] font-mono text-[12px] font-medium tracking-tight text-accent-text">
              {provider}
            </span>
          )}
          <span className="truncate font-mono text-xs text-text-primary">{model}</span>
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-text-muted">env default</div>
      )}
    </div>
  );
}
