import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ChevronRight } from 'lucide-react';

// Auth must run per-request (otherwise non-admins could hit a cached admin
// page response). The expensive part is the three DB reads below — those
// are wrapped in unstable_cache with a 30s TTL since the data shown is
// global (last 50 runs / last 7d aggregates / configured models) and
// doesn't vary by user.
export const dynamic = 'force-dynamic';

const INFRA_CACHE_TAG = 'infrastructure-telemetry';
const INFRA_CACHE_TTL = 30; // seconds

// ── Cached data fetchers ─────────────────────────────────────────────────
// These are global queries (no per-user filtering) so they're safe to cache.
// 30s TTL means a refresh hits the DB at most once every 30s no matter how
// many admins are watching the page. Auth still runs per-request below.

const getRecentRunsCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    return admin
      .from('topic_searches')
      .select(
        'id, query, status, topic_pipeline, created_at, completed_at, processing_started_at, tokens_used, estimated_cost, pipeline_state',
      )
      .eq('topic_pipeline', 'llm_v1')
      .order('created_at', { ascending: false })
      .limit(50);
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
  { revalidate: 5 * 60, tags: [INFRA_CACHE_TAG] }, // models change rarely
);

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
};

const PHASE_LABELS: Record<string, string> = {
  subtopic_research: 'Subtopic research',
  platform_scrapers: 'Platform scrapers',
  transcribe_all: 'Transcribe TikTok',
  cluster_pillars: 'Cluster pillars',
  merge: 'Merge & ideas',
  merge_retry: 'Merge retry',
};

// Cyan-only palette per Jack's "no purple" feedback. Lightness gradations
// give us 5 distinguishable steps; coral handles the "trouble" stages
// (retries, errors) since coral is the brand's accent for urgency.
const PHASE_TINTS: Record<string, string> = {
  subtopic_research: 'bg-cyan-300/85',
  platform_scrapers: 'bg-cyan-500/85',
  transcribe_all: 'bg-cyan-200/70',
  cluster_pillars: 'bg-cyan-700/85',
  merge: 'bg-cyan-400/85',
  merge_retry: 'bg-coral-500/70',
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

function totalWallClockMs(row: SearchRow): number | null {
  // Pipeline state is the source of truth — sums actual stage durations.
  // We can't use completed_at - processing_started_at because route.ts
  // resets processing_started_at to null on completion (single-flight
  // lease cleanup), so the difference is always null for finished runs.
  const stageSum = sumStageDurations(row.pipeline_state?.stages);
  if (stageSum > 0) return stageSum;
  // Fallback for runs without pipeline_state (rare): created → completed.
  if (row.completed_at) {
    return new Date(row.completed_at).getTime() - new Date(row.created_at).getTime();
  }
  return null;
}

/** Group stage rows by phase for the legend — collapses the 5 repeated
 *  "subtopic_research" entries into one summary row so the legend stays
 *  readable at a glance. Returns total + count + slowest per phase. */
function groupStagesByPhase(stages: StageRow[] | undefined): {
  phase: string;
  total: number;
  count: number;
  slowest: number;
}[] {
  if (!stages?.length) return [];
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

/** Find the phase consuming the largest share of wall-clock time. */
function longPole(stages: StageRow[] | undefined): { phase: string; ms: number; pct: number } | null {
  const grouped = groupStagesByPhase(stages);
  if (grouped.length === 0) return null;
  const total = grouped.reduce((acc, g) => acc + g.total, 0);
  if (total === 0) return null;
  const top = grouped[0];
  return { phase: top.phase, ms: top.total, pct: (top.total / total) * 100 };
}

function sumStageDurations(stages: StageRow[] | undefined): number {
  if (!stages?.length) return 0;
  return stages.reduce((acc, s) => acc + (typeof s.duration_ms === 'number' ? s.duration_ms : 0), 0);
}

function slowestStage(stages: StageRow[] | undefined): StageRow | null {
  if (!stages?.length) return null;
  let worst: StageRow | null = null;
  for (const s of stages) {
    if (typeof s.duration_ms !== 'number') continue;
    if (!worst || s.duration_ms > (worst.duration_ms ?? 0)) worst = s;
  }
  return worst;
}

function stageBar(stages: StageRow[] | undefined): { phase: string; pct: number; ms: number }[] {
  if (!stages?.length) return [];
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

export default async function InfrastructurePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const [recentResult, weeklyResult, modelsResult] = await Promise.all([
    getRecentRunsCached(),
    getWeeklyRollupCached(),
    getConfiguredModelsCached(),
  ]);

  const rows = (recentResult.data ?? []) as SearchRow[];
  const weekly = (weeklyResult.data ?? []) as Pick<
    SearchRow,
    'status' | 'completed_at' | 'processing_started_at' | 'pipeline_state'
  >[];

  const completedWeek = weekly.filter((r) => r.status === 'completed');
  const failedWeek = weekly.filter((r) => r.status === 'failed').length;

  // Sum stage durations from pipeline_state — same source-of-truth logic as
  // the per-row total. Wraps a guard for runs with no stages recorded.
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
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">Infrastructure</h1>
        <p className="text-sm text-text-muted">
          Topic search pipeline telemetry — per-stage timings for the last 50 LLM v1 runs.
          Use this to spot slow stages before chasing optimizations.
        </p>
      </header>

      {/* Summary strip — last 7 days */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Completed (7d)" value={String(completedWeek.length)} />
        <Stat label="Failed (7d)" value={String(failedWeek)} sub={
          weekly.length ? `${Math.round((failedWeek / weekly.length) * 100)}% failure rate` : undefined
        } />
        <Stat label="Avg total time" value={formatMs(avgTotal)} sub="sum of stage durations" />
        <Stat label="Avg merge stage" value={formatMs(avgMerge)} sub={
          avgSubtopic != null ? `subtopic avg: ${formatMs(avgSubtopic)}` : undefined
        } />
      </section>

      {/* Configured models */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Configured models (agency_settings)
          </h2>
          <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
            All via OpenRouter
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <ModelRow label="Planner" value={models?.topic_search_planner_model} />
          <ModelRow label="Research" value={models?.topic_search_research_model} />
          <ModelRow label="Merger" value={models?.topic_search_merger_model} />
        </dl>
        <p className="mt-3 text-xs text-text-muted">
          Edit these in <Link href="/admin/settings/ai" className="underline decoration-dotted">AI settings</Link>.
          The slug prefix (<span className="font-mono">openai/…</span>, <span className="font-mono">anthropic/…</span>, <span className="font-mono">google/…</span>)
          tells OpenRouter which provider to proxy to — the request itself always hits <span className="font-mono">openrouter.ai/api/v1/chat/completions</span>.
          Merger has a hardcoded fallback chain (Gemini 2.5 Flash → Claude 3.5 Haiku) when the primary errors.
        </p>
      </section>

      {/* Recent runs */}
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
              const longest = longPole(stages);
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
                    <span className="hidden w-44 shrink-0 truncate text-right text-xs text-text-muted md:inline-block">
                      {longest ? (
                        <>
                          long pole:{' '}
                          <span className="text-accent-text">{PHASE_LABELS[longest.phase] ?? longest.phase}</span>{' '}
                          <span className="tabular-nums">{Math.round(longest.pct)}%</span>
                        </>
                      ) : '—'}
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-nativz-border/60 px-4 py-4">
                    {bar.length > 0 ? (
                      <div className="space-y-3">
                        {/* Stacked bar — every stage segment, in execution order. */}
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
                        {/* Legend — grouped by phase so 5 subtopic-research entries
                            collapse into one line with a count + slowest detail. */}
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
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-nativz-ink-2/60 p-3 text-[11px] leading-relaxed text-text-muted">
                          {JSON.stringify(stages, null, 2)}
                        </pre>
                      </details>
                    )}

                    <div>
                      <Link
                        href={`/admin/search/${row.id}`}
                        className="text-xs text-accent-text underline decoration-dotted"
                      >
                        Open report →
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function ModelRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-nativz-border/60 bg-surface-hover/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs text-text-primary">
        {value || <span className="text-text-muted">env default</span>}
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-0.5 text-xs text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  // Brand palette: cyan = brand/success-positive, coral = error/urgency,
  // muted neutral = in-flight. No emerald (off-brand per .impeccable.md).
  const tone =
    status === 'completed'
      ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
      : status === 'failed'
        ? 'border border-coral-500/30 bg-coral-500/10 text-coral-300'
        : status === 'processing'
          ? 'border border-text-muted/30 bg-surface-hover/60 text-text-secondary'
          : 'border border-text-muted/20 bg-surface-hover/40 text-text-muted';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}
