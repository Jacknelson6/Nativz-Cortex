/**
 * ZNA-05: cache layer for per-post signals.
 *
 * `readPostSignals` returns a Map of post_metric_id -> latest signal row.
 * `upsertPostSignal` writes a fresh classification (called both on cache miss
 * during read, and as a fire-and-forget refresh when the cached row is stale).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Signal,
  SignalPlatform,
  SignalReason,
  ClassifyResult,
  Baseline,
} from '@/lib/analytics/post-signal';
import { BASELINE_WINDOW_DAYS } from '@/lib/analytics/post-signal';

export interface PostSignalRow {
  post_metric_id: string;
  client_id: string;
  organization_id: string;
  platform: SignalPlatform;
  signal: Signal;
  ratio: number | null;
  views_count: number;
  baseline_mean: number | null;
  baseline_sample_size: number;
  baseline_window_days: number;
  computed_at: string;
  reason: SignalReason;
}

export interface ReadSignalArgs {
  supabase: SupabaseClient;
  postMetricIds: string[];
}

export async function readPostSignals(
  args: ReadSignalArgs,
): Promise<Map<string, PostSignalRow>> {
  if (args.postMetricIds.length === 0) return new Map();
  const { data, error } = await args.supabase
    .from('post_performance_signals')
    .select(
      'post_metric_id, client_id, organization_id, platform, signal, ratio, views_count, baseline_mean, baseline_sample_size, baseline_window_days, computed_at, reason',
    )
    .in('post_metric_id', args.postMetricIds);
  if (error) {
    // Transient read failure: return empty so the caller treats every post as
    // a cache miss and falls through to its own synth/recompute path. The
    // resolver already has a fallback that yields a too_fresh block per post
    // if the recompute also throws, so the grid still renders.
    console.warn('[zna-05] readPostSignals failed', { err: error.message });
    return new Map();
  }
  const map = new Map<string, PostSignalRow>();
  for (const row of data ?? []) {
    map.set(row.post_metric_id, row as PostSignalRow);
  }
  return map;
}

export interface UpsertSignalArgs {
  supabase: SupabaseClient;
  postMetricId: string;
  clientId: string;
  organizationId: string;
  platform: SignalPlatform;
  viewsCount: number;
  baseline: Baseline;
  classification: ClassifyResult;
}

export async function upsertPostSignal(args: UpsertSignalArgs): Promise<void> {
  const { error } = await args.supabase
    .from('post_performance_signals')
    .upsert(
      {
        post_metric_id: args.postMetricId,
        client_id: args.clientId,
        organization_id: args.organizationId,
        platform: args.platform,
        signal: args.classification.signal,
        ratio: args.classification.ratio,
        views_count: args.viewsCount,
        baseline_mean: args.baseline.mean,
        baseline_sample_size: args.baseline.sampleSize,
        baseline_window_days: BASELINE_WINDOW_DAYS,
        computed_at: new Date().toISOString(),
        reason: args.classification.reason,
      },
      { onConflict: 'post_metric_id' },
    );
  if (error) {
    console.error('[zna-05] upsertPostSignal failed', {
      post_id: args.postMetricId,
      err: error.message,
    });
  }
}
