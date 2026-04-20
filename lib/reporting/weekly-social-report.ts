import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Data shape for the weekly branded social report (NAT-43). Populated by
 * `fetchWeeklySocialReport` from `post_metrics`, `platform_follower_daily`,
 * and `content_pipeline`. Totals are absolute counts — Jack's explicit ask
 * was "don't show % increase/decrease, just total #'s."
 */
export interface WeeklySocialReport {
  clientId: string;
  clientName: string;
  range: { start: string; end: string };
  followers: {
    /** Delta across all platforms between the first and last day in range. */
    delta: number;
    /** Per-platform breakdown so the email can render a compact list. */
    perPlatform: Array<{ platform: string; delta: number; current: number }>;
  };
  aggregates: {
    views: number;
    engagement: number; // likes + comments + shares + saves
    posts: number;
  };
  topPosts: Array<{
    platform: string;
    postUrl: string | null;
    thumbnailUrl: string | null;
    caption: string | null;
    publishedAt: string;
    views: number;
    engagement: number;
  }>;
  upcomingShoots: Array<{
    shootDate: string;
    notes: string | null;
  }>;
}

export interface WeeklySocialReportRange {
  start: string;
  end: string;
}

/** Rolling last 7 calendar days in UTC (inclusive of today). */
export function rollingSevenDayRangeUtc(now: Date = new Date()): WeeklySocialReportRange {
  const endDate = new Date(now);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

/** Next 7 calendar days starting tomorrow (for "upcoming shoots this week"). */
export function upcomingSevenDayRangeUtc(now: Date = new Date()): WeeklySocialReportRange {
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

type AdminClient = SupabaseClient;

export async function fetchWeeklySocialReport(
  admin: AdminClient,
  clientId: string,
  clientName: string,
  range: WeeklySocialReportRange,
  now: Date = new Date(),
): Promise<WeeklySocialReport> {
  const [postsRes, followersRes, upcomingRes] = await Promise.all([
    admin
      .from('post_metrics')
      .select('platform, post_url, thumbnail_url, caption, published_at, views_count, likes_count, comments_count, shares_count, saves_count')
      .eq('client_id', clientId)
      .gte('published_at', `${range.start}T00:00:00Z`)
      .lte('published_at', `${range.end}T23:59:59Z`),
    admin
      .from('platform_follower_daily')
      .select('platform, day, followers')
      .eq('client_id', clientId)
      .gte('day', range.start)
      .lte('day', range.end)
      .order('day', { ascending: true }),
    (() => {
      const upcoming = upcomingSevenDayRangeUtc(now);
      return admin
        .from('content_pipeline')
        .select('shoot_date, notes')
        .eq('client_id', clientId)
        .gte('shoot_date', upcoming.start)
        .lte('shoot_date', upcoming.end)
        .not('shoot_date', 'is', null)
        .order('shoot_date', { ascending: true });
    })(),
  ]);

  const posts = (postsRes.data ?? []) as Array<{
    platform: string;
    post_url: string | null;
    thumbnail_url: string | null;
    caption: string | null;
    published_at: string;
    views_count: number | null;
    likes_count: number | null;
    comments_count: number | null;
    shares_count: number | null;
    saves_count: number | null;
  }>;

  const follows = (followersRes.data ?? []) as Array<{
    platform: string;
    day: string;
    followers: number | null;
  }>;

  const upcoming = (upcomingRes.data ?? []) as Array<{
    shoot_date: string;
    notes: string | null;
  }>;

  // Engagement per post = likes + comments + shares + saves
  const enrichedPosts = posts.map((p) => {
    const engagement =
      (p.likes_count ?? 0) +
      (p.comments_count ?? 0) +
      (p.shares_count ?? 0) +
      (p.saves_count ?? 0);
    return {
      platform: p.platform,
      postUrl: p.post_url,
      thumbnailUrl: p.thumbnail_url,
      caption: p.caption,
      publishedAt: p.published_at,
      views: p.views_count ?? 0,
      engagement,
    };
  });

  // Top 3 by (views desc, engagement desc)
  const topPosts = [...enrichedPosts]
    .sort((a, b) => b.views - a.views || b.engagement - a.engagement)
    .slice(0, 3);

  const aggregates = enrichedPosts.reduce(
    (acc, p) => {
      acc.views += p.views;
      acc.engagement += p.engagement;
      acc.posts += 1;
      return acc;
    },
    { views: 0, engagement: 0, posts: 0 },
  );

  // Followers delta per platform: last value in range minus first value in range.
  const byPlatform = new Map<string, Array<{ day: string; followers: number }>>();
  for (const row of follows) {
    if (row.followers === null || row.followers === undefined) continue;
    const list = byPlatform.get(row.platform) ?? [];
    list.push({ day: row.day, followers: row.followers });
    byPlatform.set(row.platform, list);
  }

  const perPlatform: WeeklySocialReport['followers']['perPlatform'] = [];
  let totalDelta = 0;
  for (const [platform, list] of byPlatform) {
    if (list.length === 0) continue;
    const first = list[0].followers;
    const last = list[list.length - 1].followers;
    const delta = last - first;
    totalDelta += delta;
    perPlatform.push({ platform, delta, current: last });
  }

  return {
    clientId,
    clientName,
    range,
    followers: {
      delta: totalDelta,
      perPlatform: perPlatform.sort((a, b) => b.current - a.current),
    },
    aggregates,
    topPosts,
    upcomingShoots: upcoming.map((u) => ({ shootDate: u.shoot_date, notes: u.notes })),
  };
}
