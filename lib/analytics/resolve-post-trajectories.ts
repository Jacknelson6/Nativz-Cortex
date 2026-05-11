/**
 * ZNA-06: Resolve trajectory blocks for a page of post cards.
 *
 * Reads cached rows from `post_metric_trajectories`. Posts younger than
 * 48h that have no cache row synthesise a `too_fresh` block inline.
 * Posts older than 48h with no cache row are returned WITHOUT a
 * trajectory block - the card falls back to no pill/sparkline rather
 * than mislabelling a mature post as "Too fresh." The next cron run
 * fills the cache and subsequent loads classify correctly.
 *
 * Filtering by status is applied on the resolved set, not the
 * underlying posts query (cursor stays stable).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostCard } from '@/lib/analytics/posts-query';
import type { TrajectoryStatus } from '@/lib/analytics/trajectory';

export type StatusFilter = TrajectoryStatus | 'any';

export type AudienceMode = 'admin' | 'portal';

export interface PostCardTrajectory {
  status: TrajectoryStatus;
  status_label: string;
  r24: number | null;
  r72: number | null;
  age_hours: number;
  sparkline_views: number[];
  computed_at: string;
}

export type PostCardWithTrajectory = PostCard & { trajectory?: PostCardTrajectory };

const TOO_FRESH_HOURS = 48;

interface TrajectoryRow {
  post_metric_id: string;
  status: TrajectoryStatus;
  r24: number | null;
  r72: number | null;
  age_hours: number;
  sparkline_views: number[] | null;
  computed_at: string;
}

const ADMIN_LABEL: Record<TrajectoryStatus, string> = {
  still_climbing: 'Still climbing',
  peaked: 'Peaked',
  declining: 'Declining',
  dead: 'Dead',
  too_fresh: 'Too fresh',
};

const PORTAL_LABEL: Record<TrajectoryStatus, string> = {
  ...ADMIN_LABEL,
  dead: 'Past peak',
};

function labelFor(status: TrajectoryStatus, audience: AudienceMode): string {
  return audience === 'portal' ? PORTAL_LABEL[status] : ADMIN_LABEL[status];
}

function ageHoursFromPublished(publishedAt: string, now: Date): number {
  const ms = now.getTime() - new Date(publishedAt).getTime();
  return Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
}

export interface ResolveTrajectoryArgs {
  supabase: SupabaseClient;
  posts: PostCard[];
  audience: AudienceMode;
  statusFilter?: StatusFilter;
}

export async function resolvePostTrajectories(
  args: ResolveTrajectoryArgs,
): Promise<PostCardWithTrajectory[]> {
  const { supabase, posts, audience, statusFilter = 'any' } = args;
  if (posts.length === 0) return [];

  const ids = posts.map((p) => p.id);
  const cached = new Map<string, TrajectoryRow>();
  const { data, error } = await supabase
    .from('post_metric_trajectories')
    .select('post_metric_id, status, r24, r72, age_hours, sparkline_views, computed_at')
    .in('post_metric_id', ids);
  if (error) {
    console.warn('[zna-06] read trajectories failed', { err: error.message });
  } else {
    for (const row of (data ?? []) as TrajectoryRow[]) {
      cached.set(row.post_metric_id, row);
    }
  }

  const now = new Date();
  const enriched: PostCardWithTrajectory[] = posts.map((post) => {
    const row = cached.get(post.id);
    if (row) {
      return {
        ...post,
        trajectory: {
          status: row.status,
          status_label: labelFor(row.status, audience),
          r24: row.r24,
          r72: row.r72,
          age_hours: row.age_hours,
          sparkline_views: row.sparkline_views ?? [],
          computed_at: row.computed_at,
        },
      };
    }
    const ageHours = ageHoursFromPublished(post.published_at, now);
    if (ageHours < TOO_FRESH_HOURS) {
      const status: TrajectoryStatus = 'too_fresh';
      return {
        ...post,
        trajectory: {
          status,
          status_label: labelFor(status, audience),
          r24: null,
          r72: null,
          age_hours: ageHours,
          sparkline_views: [],
          computed_at: now.toISOString(),
        },
      };
    }
    // >=48h without a cache row: cron hasn't filled it yet. Return the
    // post unlabelled so the card hides the pill/sparkline rather than
    // mislabelling it "Too fresh."
    return post;
  });

  if (statusFilter !== 'any') {
    return enriched.filter((c) => c.trajectory?.status === statusFilter);
  }
  return enriched;
}
