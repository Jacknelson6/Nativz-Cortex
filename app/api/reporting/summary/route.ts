import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  DateRange,
  PlatformSnapshot,
  PlatformSummary,
  SummaryReport,
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
      });
    }

    const avgEngagementRate =
      platformCount > 0
        ? Math.round((combinedEngRate / platformCount) * 100) / 100
        : 0;
    const prevAvgEngagementRate =
      platformCount > 0
        ? Math.round((combinedPrevEngRate / platformCount) * 100) / 100
        : 0;

    const report: SummaryReport = {
      combined: {
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
