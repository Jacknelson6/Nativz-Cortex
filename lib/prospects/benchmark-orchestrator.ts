// SPY-05 T10: runCompetitorBenchmark — full benchmark pipeline.
//
// Insert a benchmark row, scrape + grade each picked competitor in parallel
// (re-checking cancellation between stages), compute deltas vs the prospect's
// own scorecard, write the result back.
//
// Status machine:
//   pending → discovering → scraping → grading → (succeeded | partial | failed | cancelled)
// "discovering" is the row's initial state when picks come from the LLM
// picker route; for the orchestrator's purposes we move it straight to
// "scraping" once the row exists.

import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from './analysis-queries';
import { computeScorecard } from './checklist';
import { computeDeltas } from './compute-deltas';
import { gradeCompetitor } from './grade-competitor';
import type {
  BenchmarkDeltas,
  CompetitorScorecard,
  PickedCompetitor,
  ProspectBenchmarkStatus,
  ProspectCompetitorBenchmarkRow,
} from './types';

export interface RunBenchmarkInput {
  prospectId: string;
  picks: PickedCompetitor[];
  createdBy: string | null;
}

export interface RunBenchmarkResult {
  ok: boolean;
  benchmarkId: string | null;
  status: ProspectBenchmarkStatus | null;
  message?: string;
}

function normaliseKey(p: PickedCompetitor): string {
  return `${p.platform}:${p.handle.toLowerCase().replace(/^@+/, '')}`;
}

function dedupePicks(picks: PickedCompetitor[]): PickedCompetitor[] {
  const seen = new Set<string>();
  const out: PickedCompetitor[] = [];
  for (const p of picks) {
    const key = normaliseKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, handle: p.handle.replace(/^@+/, '').trim() });
  }
  return out;
}

export async function runCompetitorBenchmark(
  input: RunBenchmarkInput,
): Promise<RunBenchmarkResult> {
  if (input.picks.length === 0) {
    return { ok: false, benchmarkId: null, status: null, message: 'No competitors picked' };
  }
  if (input.picks.length > 3) {
    return { ok: false, benchmarkId: null, status: null, message: 'Max 3 competitors per run' };
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  const analysis = await getLatestAnalysis(input.prospectId);
  if (!analysis) {
    return {
      ok: false,
      benchmarkId: null,
      status: null,
      message: 'Run prospect analysis before benchmarking competitors.',
    };
  }
  if (analysis.status === 'failed') {
    return {
      ok: false,
      benchmarkId: null,
      status: null,
      message: 'Latest prospect analysis failed — rerun before benchmarking.',
    };
  }

  const picks = dedupePicks(input.picks);

  const { data: inserted, error: insertError } = await admin
    .from('prospect_competitor_benchmarks')
    .insert({
      prospect_id: input.prospectId,
      analysis_id: analysis.id,
      status: 'scraping' satisfies ProspectBenchmarkStatus,
      picked_competitors: picks,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      benchmarkId: null,
      status: null,
      message: insertError?.message ?? 'Failed to create benchmark row',
    };
  }

  const benchmarkId = inserted.id as string;

  // Cancellation check helper — re-reads the row each call so the worker
  // notices state set by /cancel without polling on a timer.
  async function isCancelled(): Promise<boolean> {
    const { data } = await admin
      .from('prospect_competitor_benchmarks')
      .select('cancelled_at, status')
      .eq('id', benchmarkId)
      .maybeSingle();
    if (!data) return false;
    return Boolean(data.cancelled_at) || data.status === 'cancelled';
  }

  // Use a bridge flag so the per-competitor pipeline can short-circuit
  // without each grade hitting the DB independently.
  let cancelled = false;
  const cancelChecker = () => cancelled;

  try {
    if (await isCancelled()) {
      await markCancelled(benchmarkId, startedAt);
      return { ok: true, benchmarkId, status: 'cancelled' };
    }

    // Parallel grading. Each grade has its own scrape + LLM cost.
    const results = await Promise.all(
      picks.map(async (pick): Promise<CompetitorScorecard> => {
        const result = await gradeCompetitor({
          platform: pick.platform,
          handle: pick.handle,
          displayName: pick.display_name,
          isCancelled: cancelChecker,
        });
        return {
          platform: pick.platform,
          handle: pick.handle,
          display_name: pick.display_name,
          status: result.status,
          scorecard: result.scorecard,
          error: result.error,
          raw_inputs: result.raw,
        };
      }),
    );

    if (await isCancelled()) {
      cancelled = true;
      await markCancelled(benchmarkId, startedAt);
      return { ok: true, benchmarkId, status: 'cancelled' };
    }

    // Compute deltas off the prospect's own scorecard.
    const prospectSnapshot = computeScorecard(analysis);
    const deltas: BenchmarkDeltas = computeDeltas(
      prospectSnapshot,
      results.map((r) => ({ scorecard: r.scorecard })),
    );

    const okCount = results.filter((r) => r.status !== 'failed').length;
    const finalStatus: ProspectBenchmarkStatus =
      okCount === results.length ? 'succeeded' : okCount > 0 ? 'partial' : 'failed';

    const totalCost = results.reduce((sum, r) => {
      // raw_inputs.captions is the cheapest signal we have for "did we
      // do real work" but cost is summed inside gradeCompetitor — we
      // don't surface it per-competitor in the JSON. Track at the row.
      const _ = r;
      return sum;
    }, 0);

    await admin
      .from('prospect_competitor_benchmarks')
      .update({
        status: finalStatus,
        competitors: results,
        deltas,
        duration_ms: Date.now() - startedAt,
        cost_cents: totalCost,
        error_message: finalStatus === 'failed' ? 'All competitor grades failed' : null,
      })
      .eq('id', benchmarkId);

    // Touchpoint log.
    void admin.from('prospect_touchpoints').insert({
      prospect_id: input.prospectId,
      kind: 'note',
      body: `Competitor benchmark complete (${results.length} competitor${results.length === 1 ? '' : 's'}, ${okCount} graded)`,
      metadata: { benchmark_id: benchmarkId, status: finalStatus },
      created_by: input.createdBy,
    });

    return { ok: true, benchmarkId, status: finalStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown benchmark error';
    await admin
      .from('prospect_competitor_benchmarks')
      .update({
        status: 'failed' satisfies ProspectBenchmarkStatus,
        error_message: message,
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', benchmarkId);
    return { ok: false, benchmarkId, status: 'failed', message };
  }
}

async function markCancelled(benchmarkId: string, startedAt: number): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('prospect_competitor_benchmarks')
    .update({
      status: 'cancelled' satisfies ProspectBenchmarkStatus,
      duration_ms: Date.now() - startedAt,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', benchmarkId);
}

export async function getLatestBenchmark(
  prospectId: string,
): Promise<ProspectCompetitorBenchmarkRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('prospect_competitor_benchmarks')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ProspectCompetitorBenchmarkRow | null) ?? null;
}

export async function getBenchmarkById(
  benchmarkId: string,
): Promise<ProspectCompetitorBenchmarkRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('prospect_competitor_benchmarks')
    .select('*')
    .eq('id', benchmarkId)
    .maybeSingle();
  return (data as ProspectCompetitorBenchmarkRow | null) ?? null;
}
