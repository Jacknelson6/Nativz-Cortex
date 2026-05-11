/**
 * ZNA-05: per-post good/bad signal logic.
 *
 * Deterministic classification of a post's `views_count` against the brand's
 * own 30-day rolling baseline on the same platform. No LLM, no industry-wide
 * comparison: apples-to-apples within the brand. Wrapped by post-signal-cache
 * to persist to `post_performance_signals` with a 24h refresh cadence.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Signal = 'above_avg' | 'avg' | 'below_avg' | 'too_fresh';
export type SignalPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';
export type SignalReason = 'sparse_baseline' | 'too_fresh' | null;

export const ABOVE_AVG_THRESHOLD = 1.30;
export const BELOW_AVG_THRESHOLD = 0.70;
export const TOO_FRESH_HOURS = 48;
export const SPARSE_BASELINE_MIN_POSTS = 5;
export const BASELINE_WINDOW_DAYS = 30;

export interface ClassifyInput {
  views: number;
  baselineMean: number | null;
  baselineSampleSize: number;
  publishedAt: string;
  now?: Date;
}

export interface ClassifyResult {
  signal: Signal;
  ratio: number | null;
  reason: SignalReason;
}

function roundRatio(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}

export function classifySignal(input: ClassifyInput): ClassifyResult {
  const now = input.now ?? new Date();
  const publishedAt = new Date(input.publishedAt);
  const hoursSince = (now.getTime() - publishedAt.getTime()) / (60 * 60 * 1000);
  if (hoursSince < TOO_FRESH_HOURS) {
    return { signal: 'too_fresh', ratio: null, reason: 'too_fresh' };
  }
  if (
    input.baselineSampleSize < SPARSE_BASELINE_MIN_POSTS ||
    input.baselineMean === null ||
    input.baselineMean <= 0
  ) {
    return { signal: 'too_fresh', ratio: null, reason: 'sparse_baseline' };
  }

  const ratio = roundRatio((input.views ?? 0) / input.baselineMean);
  if (ratio >= ABOVE_AVG_THRESHOLD) {
    return { signal: 'above_avg', ratio, reason: null };
  }
  if (ratio <= BELOW_AVG_THRESHOLD) {
    return { signal: 'below_avg', ratio, reason: null };
  }
  return { signal: 'avg', ratio, reason: null };
}

export interface BaselineArgs {
  supabase: SupabaseClient;
  clientId: string;
  platform: SignalPlatform;
  excludePostMetricId?: string;
  now?: Date;
}

export interface Baseline {
  mean: number | null;
  sampleSize: number;
}

export async function computeBrandPlatformBaseline(
  args: BaselineArgs,
): Promise<Baseline> {
  const now = args.now ?? new Date();
  const sinceIso = new Date(
    now.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Exclude posts younger than 48h: they haven't finished climbing and
  // their view counts deflate the brand baseline. The signal classifier
  // already filters too_fresh on the read side - keep the baseline side
  // consistent.
  const upperBoundIso = new Date(
    now.getTime() - TOO_FRESH_HOURS * 60 * 60 * 1000,
  ).toISOString();

  let query = args.supabase
    .from('post_metrics')
    .select('id, views_count')
    .eq('client_id', args.clientId)
    .eq('platform', args.platform)
    .gte('published_at', sinceIso)
    .lte('published_at', upperBoundIso);

  if (args.excludePostMetricId) {
    query = query.neq('id', args.excludePostMetricId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[zna-05] baseline query failed', {
      client_id: args.clientId,
      platform: args.platform,
      err: error.message,
    });
    return { mean: null, sampleSize: 0 };
  }

  const rows = data ?? [];
  if (rows.length === 0) return { mean: null, sampleSize: 0 };

  const total = rows.reduce((sum, r) => sum + (r.views_count ?? 0), 0);
  const mean = total / rows.length;
  return { mean, sampleSize: rows.length };
}
