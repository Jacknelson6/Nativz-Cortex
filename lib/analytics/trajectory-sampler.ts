/**
 * ZNA-06: Trajectory sampler. Called every 30 min by the cron route.
 *
 * Strategy:
 *   1. Enumerate post_metrics rows published in the last 30 days.
 *   2. For each, compute next_due_tick. Skip if not yet due.
 *   3. Insert a fresh timepoint row using the post_metrics' current
 *      cumulative counts (no Zernio call here in v1 - sync-reporting
 *      already refreshes post_metrics on its own cron cadence, so
 *      reading post_metrics gives us the latest known snapshot).
 *   4. Recompute trajectory and UPSERT post_metric_trajectories.
 *   5. Call delete_expired_post_timepoints RPC and return summary.
 *
 * Concurrency cap defaults to 5; bounded loop fans out promises.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classifyTrajectory,
  nextDueTick,
  type TrajectoryStatus,
} from '@/lib/analytics/trajectory';

export interface SamplerArgs {
  supabase: SupabaseClient;
  now?: Date;
  concurrencyCap?: number;
}

export interface SamplerFailure {
  post_metric_id: string;
  reason: string;
}

export interface SamplerResult {
  scanned: number;
  sampled: number;
  classified: number;
  expiredDeleted: number;
  failures: SamplerFailure[];
  durationMs: number;
}

interface PostRow {
  id: string;
  client_id: string;
  organization_id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  published_at: string;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  saves_count: number | null;
}

async function runWithCap<T, R>(
  items: T[],
  cap: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(cap, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function runTrajectorySampler(
  args: SamplerArgs,
): Promise<SamplerResult> {
  const { supabase } = args;
  const now = args.now ?? new Date();
  const concurrencyCap = args.concurrencyCap ?? 5;
  const startedAt = now.getTime();
  const failures: SamplerFailure[] = [];

  const sinceIso = new Date(startedAt - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: postsRaw, error: postsErr } = await supabase
    .from('post_metrics')
    .select(
      'id, client_id, organization_id, platform, published_at, views_count, likes_count, comments_count, shares_count, saves_count',
    )
    .gte('published_at', sinceIso);
  if (postsErr) {
    return {
      scanned: 0,
      sampled: 0,
      classified: 0,
      expiredDeleted: 0,
      failures: [{ post_metric_id: 'query', reason: postsErr.message }],
      durationMs: Date.now() - startedAt,
    };
  }
  const posts = (postsRaw ?? []) as PostRow[];

  const ids = posts.map((p) => p.id);
  const lastCapturedMap = new Map<string, string>();
  if (ids.length > 0) {
    // Chunk in 200s to stay under URL limits.
    for (let off = 0; off < ids.length; off += 200) {
      const batch = ids.slice(off, off + 200);
      const { data: tpRows } = await supabase
        .from('post_metric_timepoints')
        .select('post_metric_id, captured_at')
        .in('post_metric_id', batch)
        .order('captured_at', { ascending: false });
      for (const row of (tpRows ?? []) as Array<{
        post_metric_id: string;
        captured_at: string;
      }>) {
        if (!lastCapturedMap.has(row.post_metric_id)) {
          lastCapturedMap.set(row.post_metric_id, row.captured_at);
        }
      }
    }
  }

  const due = posts.filter((p) => {
    const last = lastCapturedMap.get(p.id) ?? null;
    const tick = nextDueTick({
      publishedAt: p.published_at,
      lastCapturedAt: last,
      now,
    });
    return tick.getTime() <= now.getTime();
  });

  let sampled = 0;
  let classified = 0;

  await runWithCap(due, concurrencyCap, async (post) => {
    const ageHours = Math.max(
      0,
      Math.floor((now.getTime() - new Date(post.published_at).getTime()) / (60 * 60 * 1000)),
    );
    const { error: insertErr } = await supabase
      .from('post_metric_timepoints')
      .insert({
        post_metric_id: post.id,
        client_id: post.client_id,
        organization_id: post.organization_id,
        platform: post.platform,
        captured_at: now.toISOString(),
        age_hours: ageHours,
        views_count: post.views_count ?? 0,
        likes_count: post.likes_count ?? 0,
        comments_count: post.comments_count ?? 0,
        shares_count: post.shares_count ?? 0,
        saves_count: post.saves_count ?? 0,
        source: 'zernio',
      });
    if (insertErr) {
      // Unique-constraint dupes are expected when cron runs overlap; only
      // record true failures.
      if (!/duplicate/i.test(insertErr.message)) {
        failures.push({ post_metric_id: post.id, reason: insertErr.message });
        return;
      }
    } else {
      sampled++;
    }

    // Re-read last 14 days of timepoints to classify.
    const tpSinceIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tps, error: tpErr } = await supabase
      .from('post_metric_timepoints')
      .select('captured_at, views_count')
      .eq('post_metric_id', post.id)
      .gte('captured_at', tpSinceIso)
      .order('captured_at', { ascending: true });
    if (tpErr) {
      failures.push({ post_metric_id: post.id, reason: tpErr.message });
      return;
    }
    const classification = classifyTrajectory({
      publishedAt: post.published_at,
      timepoints: (tps ?? []) as Array<{ captured_at: string; views_count: number }>,
      now,
    });

    const { error: upsertErr } = await supabase
      .from('post_metric_trajectories')
      .upsert(
        {
          post_metric_id: post.id,
          client_id: post.client_id,
          organization_id: post.organization_id,
          status: classification.status as TrajectoryStatus,
          r24: classification.r24,
          r72: classification.r72,
          age_hours: classification.age_hours,
          sparkline_views: classification.sparkline_views,
          computed_at: now.toISOString(),
        },
        { onConflict: 'post_metric_id' },
      );
    if (upsertErr) {
      failures.push({ post_metric_id: post.id, reason: upsertErr.message });
      return;
    }
    classified++;
  });

  let expiredDeleted = 0;
  try {
    const { data: rpcData } = await supabase.rpc('delete_expired_post_timepoints');
    if (typeof rpcData === 'number') expiredDeleted = rpcData;
  } catch (err) {
    console.warn('[zna-06] retention RPC failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    scanned: posts.length,
    sampled,
    classified,
    expiredDeleted,
    failures,
    durationMs: Date.now() - startedAt,
  };
}
