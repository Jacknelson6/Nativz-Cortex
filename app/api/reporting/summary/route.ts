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

/**
 * Enumerate every YYYY-MM-DD in [startISO, endISO], inclusive. Used to pad
 * sparkline series out to one point per day in the requested window — the
 * snapshot cron has gaps for some brands (it only writes when Zernio
 * returns fresh data) and a 2-point sparkline reads as a straight-line
 * decline even though the truth is "we measured 2 days out of 7." Filling
 * missing days with 0 in the series makes the gap visible instead of
 * dishonestly smooth.
 */
function enumerateDays(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Build a MetricCard for one numeric column across a set of snapshots. */
function buildMetricCard(
  snaps: PlatformSnapshot[],
  prevSnaps: PlatformSnapshot[],
  pick: (s: PlatformSnapshot) => number,
  windowDays?: string[],
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
  // When the caller supplies the canonical day list, emit one point per day
  // (0 for days the cron didn't fire) so a 7-day window always renders 7
  // points. Otherwise fall back to the legacy "only present days" shape.
  const series: MetricSeriesPoint[] = windowDays
    ? windowDays.map((date) => ({ date, value: byDay.get(date) ?? 0 }))
    : [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value }));
  return {
    total,
    previousTotal: prevTotal,
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
    // Canonical "every day in the window" list. Every sparkline is padded
    // to this so a 7-day window always renders 7 points and the chart
    // honestly shows where data is missing instead of interpolating across
    // gaps.
    const windowDays = enumerateDays(start, end);

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
        'social_profile_id, platform, published_at, thumbnail_url, post_url, caption, views_count, watch_time_seconds, avg_view_duration_seconds',
      )
      .eq('client_id', clientId)
      .gte('published_at', `${start}T00:00:00`)
      .lte('published_at', `${end}T23:59:59`)
      .order('published_at', { ascending: true });

    const postsByProfile = new Map<string, TimelinePost[]>();
    // Per-profile view-weighted avg watch duration. Only YouTube populates
    // avg_view_duration_seconds on post_metrics today, so this stays at 0 for
    // other platforms until Zernio exposes equivalent data.
    const avgWatchDurationByProfile = new Map<string, number>();
    const watchDurationAccumByProfile = new Map<string, { weightedSum: number; totalViews: number }>();

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

      const avgDur = Number(row.avg_view_duration_seconds ?? 0);
      const views = row.views_count ?? 0;
      if (avgDur > 0 && views > 0) {
        const acc = watchDurationAccumByProfile.get(row.social_profile_id) ?? {
          weightedSum: 0,
          totalViews: 0,
        };
        acc.weightedSum += avgDur * views;
        acc.totalViews += views;
        watchDurationAccumByProfile.set(row.social_profile_id, acc);
      }
    }
    for (const [id, acc] of watchDurationAccumByProfile) {
      avgWatchDurationByProfile.set(id, acc.totalViews > 0 ? acc.weightedSum / acc.totalViews : 0);
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
    // Gross follow events across all platforms (MBS-style). Falls back to
    // net `followerChange` per platform on platforms that don't expose
    // gross numbers, so the headline tile always reads ≥ net change.
    let combinedNewFollows = 0;
    let combinedPrevNewFollows = 0;
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
      const postsCount = snaps.reduce(
        (sum, s) => sum + (s.posts_count ?? 0),
        0,
      );

      // Sort oldest → newest so we can compute a window delta from the
      // endpoints. Historical rows had `followers_change` hardcoded to 0
      // (fixed forward in lib/reporting/sync.ts), so summing that column
      // would silently return 0 for every older window. Subtracting the
      // first follower count from the last gives the right answer whether
      // the per-row delta is populated or not.
      const snapsAsc = [...snaps].sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date),
      );
      const latestSnap = snapsAsc[snapsAsc.length - 1];
      const firstSnap = snapsAsc[0];
      // Net follower change for the window, clamped to >=0. A brand shedding
      // followers shouldn't subtract from "New followers" rollups — the tile
      // reads as "new followers gained", not "net follower change".
      const totalFollowerChange = Math.max(
        0,
        (latestSnap?.followers_count ?? 0) - (firstSnap?.followers_count ?? 0),
      );

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
      const prevSnapsAsc = [...prevSnapsForProfile].sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date),
      );
      const prevFollowerChange = Math.max(
        0,
        (prevSnapsAsc[prevSnapsAsc.length - 1]?.followers_count ?? 0) -
          (prevSnapsAsc[0]?.followers_count ?? 0),
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

      // For each metric, prefer per-row daily values when populated; fall back
      // to the account-level window total stamped on the end-of-window
      // snapshot. This is what surfaces FB page views / LI org page views /
      // YT channel-wide views — none of them publish per-day series, but
      // their window totals are real numbers we should show.
      const accountColumnPicker =
        (rowCol: keyof PlatformSnapshot, accountCol: keyof PlatformSnapshot) =>
        (s: PlatformSnapshot): number => {
          const rowVal = (s[rowCol] as number | null) ?? 0;
          if (rowVal > 0) return rowVal;
          // Account totals only sit on the end-of-window row, so the sparkline
          // shows a single bar — that's honest. The header number is correct.
          return (s[accountCol] as number | null) ?? 0;
        };

      // Per-metric cards. A card returns undefined when both current and
      // prior totals are zero so the UI can auto-hide unsupported metrics
      // (e.g. Facebook has no profile-visits signal from Zernio).
      const metrics = {
        views: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          accountColumnPicker('views_count', 'account_views_count'),
          windowDays,
        ),
        engagement: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          accountColumnPicker('engagement_count', 'account_engagement_count'),
          windowDays,
        ),
        followersGained: (() => {
          // Follower gains aren't summable — the series's `followers_change`
          // column was hardcoded to 0 for a long time. Derive the card from
          // consecutive-day deltas of `followers_count` instead. Works for
          // both current (backfilled) and historical (all-zero) rows.
          if (totalFollowerChange === 0 && prevFollowerChange === 0) return undefined;
          // Index measured deltas by date, then emit one point per window
          // day so the sparkline always has |windowDays| points.
          const deltaByDate = new Map<string, number>();
          for (let i = 1; i < snapsAsc.length; i++) {
            const curr = snapsAsc[i];
            const prev = snapsAsc[i - 1];
            const dailyDelta =
              (curr.followers_count ?? 0) - (prev.followers_count ?? 0);
            // Clamp negative-day deltas to 0 so the sparkline never dips
            // below the axis — matches the rollup tile semantics.
            deltaByDate.set(curr.snapshot_date, Math.max(0, dailyDelta));
          }
          const series: MetricSeriesPoint[] = windowDays.map((date) => ({
            date,
            value: deltaByDate.get(date) ?? 0,
          }));
          return {
            total: totalFollowerChange,
            previousTotal: prevFollowerChange,
            changePercent: calcChange(totalFollowerChange, prevFollowerChange),
            series,
          };
        })(),
        reach: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          accountColumnPicker('reach_count', 'account_reach_count'),
          windowDays,
        ),
        impressions: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          (s) => s.impressions_count ?? 0,
          windowDays,
        ),
        profileVisits: buildMetricCard(
          snaps,
          prevSnapsForProfile,
          accountColumnPicker('profile_visits_count', 'account_profile_visits_count'),
          windowDays,
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
          // Pad to every day in the window — 0 on missing days. Engagement
          // rate of 0 isn't quite "no data" semantically, but a flat 0 still
          // reads more honestly than a 2-point line that pretends to know
          // the curve in between.
          return {
            total: Math.round(cur * 100) / 100,
            previousTotal: Math.round(prev * 100) / 100,
            changePercent: calcChange(cur, prev),
            series: windowDays.map((date) => ({
              date,
              value: byDay.get(date) ?? 0,
            })),
          };
        })(),
      };

      const totalWatchTimeSeconds = snaps.reduce(
        (sum, s) => sum + (s.watch_time_seconds ?? 0),
        0,
      );
      const avgViewDurationSeconds = avgWatchDurationByProfile.get(profileId) ?? 0;

      // Prefer account-level window totals from snapshots when Zernio exposed
      // them. These match Meta Business Suite's "Follows / Views / Content
      // interactions" numbers because they count events across the whole
      // account, not just posts published inside the window.
      //
      // Two storage shapes coexist in `platform_snapshots`:
      //   (a) per-day rows (IG/FB): `new_follows_count` is stamped on every
      //       day in the window, each row's `window_days = 1`. Summing the
      //       column across the window yields the gross total.
      //   (b) end-of-window aggregate (YT/LI legacy): a single row carries
      //       the full window total with `window_days = N`; other rows are
      //       null. Summing still works — null contributes 0.
      // Same logic applies to `unfollows_count`. `account_views_count` and
      // `account_engagement_count` remain end-of-window aggregates only.
      const sumNullable = (key: keyof (typeof snapsAsc)[number]): number | null => {
        let saw = false;
        let total = 0;
        for (const s of snapsAsc) {
          const v = s[key] as number | null | undefined;
          if (typeof v === 'number') {
            saw = true;
            total += v;
          }
        }
        return saw ? total : null;
      };
      const endSnap = snapsAsc.length > 0 ? snapsAsc[snapsAsc.length - 1] : null;
      const accountFollows = sumNullable('new_follows_count');
      const accountUnfollows = sumNullable('unfollows_count');
      const accountViews = endSnap?.account_views_count ?? null;
      const accountEngagement = endSnap?.account_engagement_count ?? null;

      // Roll up gross follows into the org-wide headline. Platforms without
      // gross data fall back to their net follower change so the combined
      // total stays ≥ the net rollup. Same logic for the prior window.
      const prevAccountFollows = (() => {
        let saw = false;
        let total = 0;
        for (const s of prevSnapsForProfile) {
          const v = s.new_follows_count;
          if (typeof v === 'number') {
            saw = true;
            total += v;
          }
        }
        return saw ? total : null;
      })();
      combinedNewFollows += accountFollows ?? totalFollowerChange;
      combinedPrevNewFollows += prevAccountFollows ?? prevFollowerChange;

      platformSummaries.push({
        platform: profile.platform,
        username: profile.username ?? '',
        avatarUrl: profile.avatar_url ?? null,
        followers: latestSnap?.followers_count ?? 0,
        followerChange: totalFollowerChange,
        newFollows: accountFollows ?? undefined,
        unfollows: accountUnfollows ?? undefined,
        totalViews: accountViews ?? totalViews,
        totalEngagement: accountEngagement ?? totalEngagement,
        engagementRate: Math.round(avgEngRate * 100) / 100,
        postsCount,
        watchTimeSeconds: totalWatchTimeSeconds,
        avgViewDurationSeconds: Math.round(avgViewDurationSeconds * 100) / 100,
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

    // Build daily time-series for chart (aggregate across all platforms per date).
    // Clamp per-row follower change to >=0 so a single platform's churn day
    // can't pull the cross-platform "New followers" sparkline negative.
    const dailyMap = new Map<string, { views: number; engagement: number; followers: number }>();
    for (const snap of snapshots) {
      const d = snap.snapshot_date;
      const existing = dailyMap.get(d) ?? { views: 0, engagement: 0, followers: 0 };
      existing.views += snap.views_count ?? 0;
      existing.engagement += snap.engagement_count ?? 0;
      // Prefer gross new-follows (IG/FB) when present so the sparkline
      // matches the gross headline. Fall back to net follower delta on
      // platforms without gross data. Clamp to >=0 either way.
      existing.followers += Math.max(
        0,
        snap.new_follows_count ?? snap.followers_change ?? 0,
      );
      dailyMap.set(d, existing);
    }

    // Pull the per-day follower table here so the combined chart can derive
    // its "New followers" daily series from genuine daily data instead of
    // the gappy snapshot table. platform_follower_daily is written every
    // day Zernio returns a value, regardless of whether the snapshot cron
    // wrote a full row that day, so a brand whose snapshots run weekly
    // still gets a 7-point sparkline on a 7-day window.
    const { data: followerDaily } = await supabase
      .from('platform_follower_daily')
      .select('platform, day, followers')
      .eq('client_id', clientId)
      .gte('day', start)
      .lte('day', end)
      .order('day', { ascending: true });

    // Sum followers across platforms per day → cross-platform absolute total.
    const totalFollowersByDay = new Map<string, number>();
    for (const row of followerDaily ?? []) {
      totalFollowersByDay.set(
        row.day,
        (totalFollowersByDay.get(row.day) ?? 0) + (row.followers ?? 0),
      );
    }
    // Day-over-day delta of the cross-platform total, clamped to >=0 so a
    // single platform's churn day doesn't pull the rollup negative. Day 1
    // of the window has no prior reference inside the window, so its delta
    // is 0 (we don't reach outside the window for the prior baseline).
    const followerDeltaByDay = new Map<string, number>();
    let priorTotal: number | null = null;
    for (const date of windowDays) {
      const totalToday = totalFollowersByDay.get(date);
      if (totalToday === undefined) {
        // No measurement that day — carry the prior total forward so the
        // next measured day's delta is computed against the right baseline,
        // and report a 0 delta for today.
        followerDeltaByDay.set(date, 0);
        continue;
      }
      if (priorTotal === null) {
        followerDeltaByDay.set(date, 0);
      } else {
        followerDeltaByDay.set(date, Math.max(0, totalToday - priorTotal));
      }
      priorTotal = totalToday;
    }

    const chart = windowDays.map((date) => {
      const measured = dailyMap.get(date);
      return {
        date,
        views: measured?.views ?? 0,
        engagement: measured?.engagement ?? 0,
        // Followers comes from the daily follower table (reliable) rather
        // than the snapshot table (gappy). When neither source covered a
        // day, the delta is 0.
        followers: followerDeltaByDay.get(date) ?? 0,
      };
    });

    // Build per-platform daily time-series. Same negative-clamp rule as the
    // combined chart — "Followers gained" never goes below zero on any tile.
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
      // Prefer gross new-follows (IG/FB) when present so the sparkline
      // matches the gross headline. Fall back to net follower delta on
      // platforms without gross data. Clamp to >=0 either way.
      existing.followers += Math.max(
        0,
        snap.new_follows_count ?? snap.followers_change ?? 0,
      );
      dMap.set(d, existing);
    }

    // Per-platform "followers gained" daily series derived from
    // platform_follower_daily, mirroring what we did for the combined chart.
    const followerDailyByPlatform = new Map<string, Map<string, number>>();
    for (const row of followerDaily ?? []) {
      if (!followerDailyByPlatform.has(row.platform)) {
        followerDailyByPlatform.set(row.platform, new Map());
      }
      followerDailyByPlatform.get(row.platform)!.set(row.day, row.followers ?? 0);
    }

    const platformCharts: Record<string, { date: string; views: number; engagement: number; followers: number }[]> = {};
    const platformsTouched = new Set<string>([
      ...platformDailyMaps.keys(),
      ...followerDailyByPlatform.keys(),
    ]);
    for (const platform of platformsTouched) {
      const dMap = platformDailyMaps.get(platform);
      const fMap = followerDailyByPlatform.get(platform);
      // Day-over-day follower delta from platform_follower_daily for this
      // platform specifically.
      let prevForPlatform: number | null = null;
      const platformFollowerDelta = new Map<string, number>();
      for (const date of windowDays) {
        const today = fMap?.get(date);
        if (today === undefined) {
          platformFollowerDelta.set(date, 0);
          continue;
        }
        platformFollowerDelta.set(
          date,
          prevForPlatform === null ? 0 : Math.max(0, today - prevForPlatform),
        );
        prevForPlatform = today;
      }
      platformCharts[platform] = windowDays.map((date) => {
        const m = dMap?.get(date);
        return {
          date,
          views: m?.views ?? 0,
          engagement: m?.engagement ?? 0,
          followers: platformFollowerDelta.get(date) ?? 0,
        };
      });
    }

    // Sum total followers across all platforms (from latest snapshot each)
    const totalFollowers = platformSummaries.reduce((sum, p) => sum + (p.followers ?? 0), 0);

    // Per-platform cumulative follower chart — one line per network. Uses
    // platform_follower_daily (queried up above for the combined chart),
    // so the chart matches the real ground truth Zernio reported each day.
    // Pivot { platform, day, followers } → { day, [platform]: followers }
    // and pad to every day in the window. Missing days carry the prior
    // platform value forward so the line stays continuous (followers are
    // cumulative — a missing snapshot doesn't mean 0 followers).
    const followerChartMap = new Map<string, Record<string, number>>();
    for (const row of followerDaily ?? []) {
      const entry = followerChartMap.get(row.day) ?? {};
      entry[row.platform] = row.followers ?? 0;
      followerChartMap.set(row.day, entry);
    }
    const carryForward: Record<string, number> = {};
    const followerChart = windowDays.map((date) => {
      const measured = followerChartMap.get(date);
      if (measured) {
        for (const [p, v] of Object.entries(measured)) carryForward[p] = v;
      }
      return { date, ...carryForward };
    });

    // Platform breakdown table: compact totals row per platform (Zernio-
    // dashboard-style) so the admin can scan all networks side by side.
    const platformBreakdown = platformSummaries.map((p) => ({
      platform: p.platform,
      username: p.username,
      followers: p.followers,
      followerChange: p.followerChange,
      newFollows: p.newFollows,
      unfollows: p.unfollows,
      views: p.totalViews,
      engagement: p.totalEngagement,
      engagementRate: p.engagementRate,
      postsCount: p.postsCount,
      watchTimeSeconds: p.watchTimeSeconds,
      avgViewDurationSeconds: p.avgViewDurationSeconds,
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
        totalNewFollows: combinedNewFollows,
        totalNewFollowsChange: calcChange(
          combinedNewFollows,
          combinedPrevNewFollows,
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
