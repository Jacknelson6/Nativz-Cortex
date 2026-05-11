/**
 * ZNA-05: resolve signals for a page of post cards.
 *
 * For each post:
 *   1. Look up the latest persisted signal.
 *   2. If missing -> compute now, persist, return.
 *   3. If present and fresh (<24h) -> return cached.
 *   4. If present and stale -> return cached AND fire-and-forget a recompute
 *      so the next request sees the new value.
 *
 * Filtering by signal type is applied on the resolved set, not in the
 * underlying posts query, so the cursor stays stable.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostCard } from '@/lib/analytics/posts-query';
import {
  classifySignal,
  computeBrandPlatformBaseline,
  BASELINE_WINDOW_DAYS,
} from '@/lib/analytics/post-signal';
import type { Signal, SignalPlatform, SignalReason } from '@/lib/analytics/post-signal';
import {
  readPostSignals,
  upsertPostSignal,
  type PostSignalRow,
} from '@/lib/analytics/post-signal-cache';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type SignalFilter = Signal | 'any';

export interface PostCardSignal {
  classification: Signal;
  ratio: number | null;
  baseline_mean: number | null;
  baseline_sample_size: number;
  baseline_window_days: number;
  computed_at: string;
  reason: SignalReason;
}

export type PostCardWithSignal = PostCard & { signal: PostCardSignal };

export interface ResolveSignalsArgs {
  supabase: SupabaseClient;
  organizationId: string;
  posts: PostCard[];
  signalFilter?: SignalFilter;
}

function rowToSignalBlock(row: PostSignalRow): PostCardSignal {
  return {
    classification: row.signal,
    ratio: row.ratio,
    baseline_mean: row.baseline_mean,
    baseline_sample_size: row.baseline_sample_size,
    baseline_window_days: row.baseline_window_days,
    computed_at: row.computed_at,
    reason: row.reason,
  };
}

async function computeAndPersist(
  supabase: SupabaseClient,
  post: PostCard,
  organizationId: string,
): Promise<PostCardSignal> {
  const platform = post.platform as SignalPlatform;
  const baseline = await computeBrandPlatformBaseline({
    supabase,
    clientId: post.client_id,
    platform,
    excludePostMetricId: post.id,
  });
  const classification = classifySignal({
    views: post.views_count,
    baselineMean: baseline.mean,
    baselineSampleSize: baseline.sampleSize,
    publishedAt: post.published_at,
  });
  await upsertPostSignal({
    supabase,
    postMetricId: post.id,
    clientId: post.client_id,
    organizationId,
    platform,
    viewsCount: post.views_count,
    baseline,
    classification,
  });
  return {
    classification: classification.signal,
    ratio: classification.ratio,
    baseline_mean: baseline.mean,
    baseline_sample_size: baseline.sampleSize,
    baseline_window_days: BASELINE_WINDOW_DAYS,
    computed_at: new Date().toISOString(),
    reason: classification.reason,
  };
}

export async function resolvePostSignals(
  args: ResolveSignalsArgs,
): Promise<PostCardWithSignal[]> {
  const { supabase, organizationId, posts, signalFilter = 'any' } = args;
  if (posts.length === 0) return [];

  const ids = posts.map((p) => p.id);
  const cached = await readPostSignals({ supabase, postMetricIds: ids });

  const now = Date.now();

  // Cache-miss writes are independent per post; run them in parallel so the
  // first-render path doesn't serialize N baseline computations.
  const enriched: PostCardWithSignal[] = await Promise.all(
    posts.map(async (post): Promise<PostCardWithSignal> => {
      const existing = cached.get(post.id);
      if (existing) {
        const computedAtMs = new Date(existing.computed_at).getTime();
        const stale = now - computedAtMs >= STALE_AFTER_MS;
        if (stale) {
          // Fire-and-forget refresh; failure is logged but never thrown.
          void computeAndPersist(supabase, post, organizationId).catch((err) => {
            console.error('[zna-05] stale-refresh failed', {
              post_id: post.id,
              err: err instanceof Error ? err.message : String(err),
            });
          });
        }
        return { ...post, signal: rowToSignalBlock(existing) };
      }
      try {
        const signal = await computeAndPersist(supabase, post, organizationId);
        return { ...post, signal };
      } catch (err) {
        console.error('[zna-05] sync compute failed', {
          post_id: post.id,
          err: err instanceof Error ? err.message : String(err),
        });
        // Fallback to a deterministic too_fresh card so the response shape stays whole.
        return {
          ...post,
          signal: {
            classification: 'too_fresh',
            ratio: null,
            baseline_mean: null,
            baseline_sample_size: 0,
            baseline_window_days: BASELINE_WINDOW_DAYS,
            computed_at: new Date().toISOString(),
            reason: 'sparse_baseline',
          },
        };
      }
    }),
  );

  if (signalFilter !== 'any') {
    return enriched.filter((c) => c.signal.classification === signalFilter);
  }
  return enriched;
}
