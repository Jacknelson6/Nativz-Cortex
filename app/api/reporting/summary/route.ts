import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  DateRange,
  MetricCard,
  MetricSeriesPoint,
  PlatformSnapshot,
  PlatformSummary,
  SummaryReport,
  TimelinePost,
} from '@/lib/types/reporting';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

/** Build a MetricCard for one numeric column across a set of snapshots. */
function buildMetricCard(
  snaps: PlatformSnapshot[],
  prevSnaps: PlatformSnapshot[],
  pick: (s: PlatformSnapshot) => number,
): MetricCard | undefined {
  let total = 0;
  const byDay = new Map<string, number>();
  for (const s of snaps) {
    const v = pick(s) || 0;
    total += v;
    byDay.set(s.snapshot_date, (byDay.get(s.snapshot_date) ?? 0) + v);
  }
  const prevTotal = prevSnaps.reduce((sum, s) => sum + (pick(s) || 0), 0);
  if (total === 0 && prevTotal === 0) return undefined;
  const series: MetricSeriesPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  return {
    total,
    changePercent: calcChange(total, prevTotal),
    series,
  };
}

/**
 * GET /api/reporting/summary
 *
 * Compute a combined analytics summary for a client across all active social profiles.
 * Compares the requested period against an equal-length prior period to calculate
 * percentage changes. Returns per-platform breakdowns plus rolled-up combined metrics.
 *
 * @auth Required (any authenticated user)
 * @query clientId - Client UUID (required)
 * @query start - Period start date YYYY-MM-DD (required)
 * @query end - Period end date YYYY-MM-DD (required)
 * @returns {SummaryReport}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      clientId: searchParams.get('clientId'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, start, end } = parsed.data;
    const dateRange: DateRange = { start, end };

    // Calculate previous period (same length before start)
    const startDate = new Date(start);
    const endDate = new Date(end);
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength)
      .toISOString()
      .split('T')[0];
    const prevEnd = new Date(startDate.getTime() - 1)
      .toISOString()
      .split('T')[0];

    // Query current period snapshots
    const { data: currentSnapshots, error: currentError } = await supabase
      .from('platform_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .gte('snapshot_date', start)
      .lte('snapshot_date', end);

    if (currentError) {
      return NextResponse.json(
        { error: 'Failed to fetch current snapshots' },
        { status: 500 },
      );
    }

    // Query previous period snapshots
    const { data: previousSnapshots, error: previousError } = await supabase
      .from('platform_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .gte('snapshot_date', prevStart)
      .lte('snapshot_date', prevEnd);

    if (previousError) {
      return NextResponse.json(
        { error: 'Failed to fetch previous snapshots' },
        { status: 500 },
      );
    }

    // Query social profiles for platform/username info
    const { data: profiles, error: profilesError } = await supabase
      .from('social_profiles')
      .select('id, platform, username, avatar_url')
      .eq('client_id', clientId)
      .eq('is_active', true);

    if (profilesError) {
      return NextResponse.json(
        { error: 'Failed to fetch social profiles' },
        { status: 500 },
      );
    }

    // Query posts that published in this window — used to render 9:16
     // thumbnails along each platform sparkline so spikes can be mapped to
     // the content that drove them.
    const { data: postRows } = await supabase
      .from('post_metrics')
      .select(
        'social_profile_id, platform, published_at, thumbnail_url, post_url, caption, views_count',
      )
      .eq('client_id', clientId)
      .gte('published_at', `${start}T00:00:00`)
      .lte('published_at', `${end}T23:59:59`)
      .order('published_at', { ascending: true });

    const postsByProfile = new Map<string, TimelinePost[]>();
    for (const row of postRows ?? []) {
      if (!row.social_profile_id || !row.published_at) continue;
      const date = String(row.published_at).split('T')[0];
      const list = postsByProfile.get(row.social_profile_id) ?? [];
      list.push({
        date,
        thumbnailUrl: row.thumbnail_url ?? null,
        postUrl: row.post_url ?? null,
        caption: row.caption ?? null,
        views: row.views_count ?? 0,
      });
      postsByProfile.set(row.social_profile_id, list);
    }

    const snapshots = (currentSnapshots ?? []) as PlatformSnapshot[];
    const prevSnaps = (previousSnapshots ?? []) as PlatformSnapshot[];
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p]),
    );

    // Group snapshots by platform
    const platformGroups = new Map<string, PlatformSnapshot[]>();
    const prevPlatformGroups = new Map<string, PlatformSnapshot[]>();

    for (const snap of snapshots) {
      const key = snap.social_profile_id;
      if (!platformGroups.has(key)) platformGroups.set(key, []);
      platformGroups.get(key)!.push(snap);
    }

    for (const snap of prevSnaps) {
      const key = snap.social_profile_id;
      if (!prevPlatformGroups.has(key)) prevPlatformGroups.set(key, []);
      prevPlatformGroups.get(key)!.push(snap);
    }

    // Calculate per-platform summaries
    const platformSummaries: PlatformSummary[] = [];
    let combinedViews = 0;
    let combinedPrevViews = 0;
    let combinedFollowerChange = 0;
    let combinedPrevFollowerChange = 0;
    let combinedEngagement = 0;
    let combinedPrevEngagement = 0;
    let combinedEngRate = 0;
    let combinedPrevEngRate = 0;
    let platformCount = 0;

    for (const [profileId, snaps] of platformGroups) {
      const profile = profileMap.get(profileId);
      if (!profile) continue;

      const prevSnapsForProfile = prevPlatformGroups.get(profileId) ?? [];

      // Aggregate current period
      const totalViews = snaps.reduce((sum, s) => sum + (s.views_count ?? 0), 0);
      const totalEngagement = snaps.reduce(
        (sum, s) => sum + (s.engagement_count ?? 0),
        0,
      );
      const totalFollowerChange = snaps.reduce(
        (sum, s) => sum + (s.followers_change ?? 0),
        0,
      );
      const postsCount = snaps.reduce(
        (sum, s) => sum + (s.posts_count ?? 0),
        0,
      );

      // Latest snapshot for current follower count
      const latestSnap = snaps.sort(
        (a, b) => b.snapshot_date.localeCompare(a.snapshot_date),
      )[0];

      const avgEngRate =
        snaps.length > 0
          ? snaps.reduce((sum, s) => sum + (s.engagement_rate ?? 0), 0) /
            snaps.length
          : 0;

      // Aggregate previous period
      const prevViews = prevSnapsForProfile.reduce(
        (sum, s) => sum + (s.views_count ?? 0),
        0,
      );
      const prevEngagement = prevSnapsForProfile.reduce(
        (sum, s) => sum + (s.engagement_count ?? 0),
        0,
      );
      const prevFollowerChange = prevSnapsForProfile.reduce(
        (sum, s) => sum + (s.followers_change ?? 0),
        0,
      );
      const prevAvgEngRate =
        prevSnapsForProfile.length > 0
          ? prevSnapsForProfile.reduce(
              (sum, s) => sum + (s.engagement_rate ?? 0),
              0,
            ) / prevSnapsForProfile.length
          : 0;

      combinedViews += totalViews;
      combinedPrevViews += prevViews;
      combinedFollowerChange += totalFollowerChange;
      combinedPrevFollowerChange += prevFollowerChange;
      combinedEngagement += totalEngagement;
      combinedPrevEngagement += prevEngagement;
      combinedEngRate += avgEngRate;
      combinedPrevEngRate += prevAvgEngRate;
      platformCount++;

      // Per-metric cards. A card returns undefined when both current and
      // prior totals are zero so the UI can auto-hide unsupported metrics
      // (e.g. Facebook has no profile-visits signal from Zernio).
      const metrics = {
        views: buildMetricCard(snaps, prevSnapsForProfile, (s) => s.views_count ?? 0),
        engagement: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          (s) => s.engagement_count ?? 0,
        ),
        followersGained: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          (s) => s.followers_change ?? 0,
        ),
        reach: buildMetricCard(snaps, prevSnapsForProfile, (s) => s.reach_count ?? 0),
        impressions: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          (s) => s.impressions_count ?? 0,
        ),
        profileVisits: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          (s) => s.profile_visits_count ?? 0,
        ),
        engagementRate: (() => {
          // Engagement rate isn't summable — report the window average and
          // compare to the prior window average.
          const cur =
            snaps.length > 0
              ? snaps.reduce((sum, s) => sum + (s.engagement_rate ?? 0), 0) / snaps.length
              : 0;
          const prev =
            prevSnapsForProfile.length > 0
              ? prevSnapsForProfile.reduce((sum, s) => sum + (s.engagement_rate ?? 0), 0) /
                prevSnapsForProfile.length
              : 0;
          if (cur === 0 && prev === 0) return undefined;
          const byDay = new Map<string, number>();
          for (const s of snaps) byDay.set(s.snapshot_date, s.engagement_rate ?? 0);
          return {
            total: Math.round(cur * 100) / 100,
            changePercent: calcChange(cur, prev),
            series: [...byDay.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, value]) => ({ date, value })),
          };
        })(),
      };

      platformSummaries.push({
        platform: profile.platform,
        username: profile.username ?? '',
        avatarUrl: profile.avatar_url ?? null,
        followers: latestSnap?.followers_count ?? 0,
        followerChange: totalFollowerChange,
        totalViews,
        totalEngagement,
        engagementRate: Math.round(avgEngRate * 100) / 100,
        postsCount,
        metrics,
        posts: postsByProfile.get(profileId) ?? [],
      });
    }

    // Profiles with zero window activity still need a section so the user
    // sees the account exists. Fill in with the latest known follower count
    // from platform_follower_daily (outside the window is fine) and an
    // empty metrics block. The UI will render a "no activity" card grid.
    const profileIdsWithSummary = new Set(platformSummaries.map((p) => {
      const match = [...profileMap.entries()].find(([, v]) => v.platform === p.platform && (v.username ?? '') === p.username);
      return match?.[0];
    }));
    const missingProfiles = (profiles ?? []).filter((p) => !profileIdsWithSummary.has(p.id));
    if (missingProfiles.length > 0) {
      const { data: latestFollowers } = await supabase
        .from('platform_follower_daily')
        .select('social_profile_id, followers, day')
        .in('social_profile_id', missingProfiles.map((p) => p.id))
        .order('day', { ascending: false });

      const latestByProfile = new Map<string, number>();
      for (const row of latestFollowers ?? []) {
        if (!latestByProfile.has(row.social_profile_id)) {
          latestByProfile.set(row.social_profile_id, row.followers ?? 0);
        }
      }

      for (const p of missingProfiles) {
        platformSummaries.push({
          platform: p.platform,
          username: p.username ?? '',
          avatarUrl: p.avatar_url ?? null,
          followers: latestByProfile.get(p.id) ?? 0,
          followerChange: 0,
          totalViews: 0,
          totalEngagement: 0,
          engagementRate: 0,
          postsCount: 0,
          metrics: {},
          posts: postsByProfile.get(p.id) ?? [],
        });
      }
    }

    const avgEngagementRate =
      platformCount > 0
        ? Math.round((combinedEngRate / platformCount) * 100) / 100
        : 0;
    const prevAvgEngagementRate =
      platformCount > 0
        ? Math.round((combinedPrevEngRate / platformCount) * 100) / 100
        : 0;

    // Build daily time-series for chart (aggregate across all platforms per date)
    const dailyMap = new Map<string, { views: number; engagement: number; followers: number }>();
    for (const snap of snapshots) {
      const d = snap.snapshot_date;
      const existing = dailyMap.get(d) ?? { views: 0, engagement: 0, followers: 0 };
      existing.views += snap.views_count ?? 0;
      existing.engagement += snap.engagement_count ?? 0;
      existing.followers += snap.followers_change ?? 0;
      dailyMap.set(d, existing);
    }

    const chart = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, views: d.views, engagement: d.engagement, followers: d.followers }));

    // Build per-platform daily time-series
    const platformDailyMaps = new Map<string, Map<string, { views: number; engagement: number; followers: number }>>();
    for (const snap of snapshots) {
      const profile = profileMap.get(snap.social_profile_id);
      if (!profile) continue;
      const platform = profile.platform;
      if (!platformDailyMaps.has(platform)) platformDailyMaps.set(platform, new Map());
      const dMap = platformDailyMaps.get(platform)!;
      const d = snap.snapshot_date;
      const existing = dMap.get(d) ?? { views: 0, engagement: 0, followers: 0 };
      existing.views += snap.views_count ?? 0;
      existing.engagement += snap.engagement_count ?? 0;
      existing.followers += snap.followers_change ?? 0;
      dMap.set(d, existing);
    }

    const platformCharts: Record<string, { date: string; views: number; engagement: number; followers: number }[]> = {};
    for (const [platform, dMap] of platformDailyMaps) {
      platformCharts[platform] = [...dMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, views: d.views, engagement: d.engagement, followers: d.followers }));
    }

    // Sum total followers across all platforms (from latest snapshot each)
    const totalFollowers = platformSummaries.reduce((sum, p) => sum + (p.followers ?? 0), 0);

    // Per-platform cumulative follower chart — one line per network. We
    // read platform_follower_daily (stored by the sync in per-day
    // granularity) rather than inferring from snapshots, so the chart
    // matches the real ground truth Zernio reported for each day.
    const { data: followerDaily } = await supabase
      .from('platform_follower_daily')
      .select('platform, day, followers')
      .eq('client_id', clientId)
      .gte('day', start)
      .lte('day', end)
      .order('day', { ascending: true });

    // Pivot { platform, day, followers } → { day, [platform]: followers }
    const followerChartMap = new Map<string, Record<string, number>>();
    for (const row of followerDaily ?? []) {
      const entry = followerChartMap.get(row.day) ?? {};
      entry[row.platform] = row.followers ?? 0;
      followerChartMap.set(row.day, entry);
    }
    const followerChart = [...followerChartMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byPlatform]) => ({ date, ...byPlatform }));

    // Platform breakdown table: compact totals row per platform (Zernio-
    // dashboard-style) so the admin can scan all networks side by side.
    const platformBreakdown = platformSummaries.map((p) => ({
      platform: p.platform,
      username: p.username,
      followers: p.followers,
      followerChange: p.followerChange,
      views: p.totalViews,
      engagement: p.totalEngagement,
      engagementRate: p.engagementRate,
      postsCount: p.postsCount,
    }));

    const report: SummaryReport = {
      followerChart,
      platformBreakdown,
      combined: {
        totalFollowers,
        totalViews: combinedViews,
        totalViewsChange: calcChange(combinedViews, combinedPrevViews),
        totalFollowerChange: combinedFollowerChange,
        totalFollowerChangeChange: calcChange(
          combinedFollowerChange,
          combinedPrevFollowerChange,
        ),
        totalEngagement: combinedEngagement,
        totalEngagementChange: calcChange(
          combinedEngagement,
          combinedPrevEngagement,
        ),
        avgEngagementRate,
        avgEngagementRateChange: calcChange(
          avgEngagementRate,
          prevAvgEngagementRate,
        ),
      },
      platforms: platformSummaries,
      dateRange,
      chart,
      platformCharts,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('GET /api/reporting/summary error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
