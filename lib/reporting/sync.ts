import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService, ZernioPostingService } from '@/lib/posting';
import type { DateRange } from '@/lib/types/reporting';
import type { SocialPlatform } from '@/lib/posting/types';

interface SyncResult {
  synced: boolean;
  platforms: string[];
  postsCount: number;
  errors: string[];
}

interface ProfileRow {
  id: string;
  platform: SocialPlatform;
  late_account_id: string;
}

function assertZernioKey(result: SyncResult): boolean {
  if (!process.env.ZERNIO_API_KEY?.trim() && !process.env.LATE_API_KEY?.trim()) {
    result.errors.push(
      'Social reporting sync skipped: ZERNIO_API_KEY is not set. Create a key in Zernio (Settings → API keys). Docs: https://docs.zernio.com/ — legacy LATE_API_KEY is still accepted during migration.',
    );
    return false;
  }
  return true;
}

/**
 * Sync one social_profile row against Zernio. Extracted from
 * syncClientReporting so admin UI can trigger a targeted re-pull for a
 * single profile (e.g. after a Zernio reconnect) without re-running the
 * whole client.
 */
export async function syncSocialProfile(
  profile: ProfileRow,
  clientId: string,
  dateRange: DateRange,
  result: SyncResult,
): Promise<void> {
  const service = getPostingService();
  const zernio = new ZernioPostingService();
  const adminClient = createAdminClient();
  const platform = profile.platform;
  const lateAccountId = profile.late_account_id;

  // Follower stats + daily metrics + IG insights + per-post analytics in parallel.
  // Posts are pulled here (instead of in a later try/catch) so YouTube can fan
  // out to per-video daily-views endpoints without serializing an extra round-
  // trip.
  try {
    const [followerStats, dailyMetrics, igInsights, posts] = await Promise.all([
      service.getFollowerStats(lateAccountId, dateRange.start, dateRange.end),
      service.getDailyMetrics({
        accountId: lateAccountId,
        startDate: dateRange.start,
        endDate: dateRange.end,
      }),
      platform === 'instagram'
        ? zernio.getInstagramInsights(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve({ profileVisits: [], reachSeries: [] }),
      service.getPostAnalytics({
        accountId: lateAccountId,
        startDate: dateRange.start,
        endDate: dateRange.end,
      }),
    ]);

    // Per-video watch time + retention for YouTube posts.
    //
    // Zernio's standard /analytics endpoint only returns views/likes/etc for
    // each post; watch time lives on /analytics/youtube/daily-views?videoId=X.
    // We fan out in parallel — typical account has 10–40 YT videos in the
    // window. TikTok has no equivalent watch-time endpoint in Zernio, so
    // ytAggregates stays empty for non-YT profiles and the post_metrics rows
    // are upserted with zeros.
    interface YtAgg {
      watchSec: number;
      avgViewDur: number;
      subsG: number;
      subsL: number;
    }
    const ytAggregates = new Map<string, YtAgg>();
    const ytWatchMinutesByDay = new Map<string, number>();

    if (platform === 'youtube' && posts.length > 0) {
      const videoPosts = posts.filter((p) => !!p.platformPostId);
      const pulls = await Promise.all(
        videoPosts.map(async (p) => {
          const rows = await zernio.getYoutubeDailyViews(lateAccountId, p.platformPostId!);
          return { p, rows };
        }),
      );
      for (const { p, rows } of pulls) {
        if (rows.length === 0) continue;
        const watchSec = Math.round(
          rows.reduce((s, r) => s + r.estimatedMinutesWatched * 60, 0),
        );
        const totalViewsInSeries = rows.reduce((s, r) => s + r.views, 0);
        // View-weighted average so one day with 5k views dominates a day with 10.
        const avgViewDur =
          totalViewsInSeries > 0
            ? rows.reduce((s, r) => s + r.averageViewDuration * r.views, 0) /
              totalViewsInSeries
            : 0;
        const subsG = rows.reduce((s, r) => s + r.subscribersGained, 0);
        const subsL = rows.reduce((s, r) => s + r.subscribersLost, 0);
        ytAggregates.set(p.postId, {
          watchSec,
          avgViewDur: Math.round(avgViewDur * 100) / 100,
          subsG,
          subsL,
        });
        for (const r of rows) {
          ytWatchMinutesByDay.set(
            r.date,
            (ytWatchMinutesByDay.get(r.date) ?? 0) + r.estimatedMinutesWatched,
          );
        }
      }
    }

    const followersByDay = new Map<string, number>();
    for (const p of followerStats.series) followersByDay.set(p.date, p.followers);
    const profileVisitsByDay = new Map<string, number>();
    for (const p of igInsights.profileVisits) profileVisitsByDay.set(p.date, p.value);
    const igReachByDay = new Map<string, number>();
    for (const p of igInsights.reachSeries) igReachByDay.set(p.date, p.value);

    // Zernio's follower series usually only returns the last few days.
    // Use the oldest series point (or the current count) as a fill-in for
    // earlier days rather than writing 0 — follower counts change slowly
    // and "unknown" is closer to "current" than to zero.
    const sortedSeries = [...followerStats.series].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const oldestSeriesValue =
      sortedSeries[0]?.followers ?? followerStats.followers ?? 0;
    const followerForDay = (date: string): number => {
      const exact = followersByDay.get(date);
      if (typeof exact === 'number') return exact;
      // Walk forward through the (sorted) series to find the latest point
      // on or before `date`. If `date` is older than every point, fall
      // back to the oldest known value.
      let last = oldestSeriesValue;
      for (const p of sortedSeries) {
        if (p.date > date) break;
        last = p.followers;
      }
      return last;
    };

    if (dailyMetrics.length > 0) {
      // Compute per-day follower delta from the Zernio series. Previously this
      // was hardcoded to 0, which meant the summary route's sum (which drives
      // the "Gained" column on the Analytics page) always came out to 0 even
      // when the series itself showed growth. Summing `today - yesterday`
      // across the window is algebraically equivalent to `last - first`, so
      // the total matches what Zernio reports for the period.
      const followerForPrevDay = (date: string): number => {
        const d = new Date(`${date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return followerForDay(d.toISOString().split('T')[0]);
      };
      const rows = dailyMetrics.map((day) => ({
        social_profile_id: profile.id,
        client_id: clientId,
        platform,
        snapshot_date: day.date,
        followers_count: followerForDay(day.date),
        followers_change: followerForDay(day.date) - followerForPrevDay(day.date),
        views_count: day.views,
        engagement_count: day.engagement,
        engagement_rate: day.engagementRate,
        posts_count: day.postsCount,
        reach_count: igReachByDay.get(day.date) ?? day.reach,
        impressions_count: day.impressions,
        link_clicks_count: day.clicks,
        profile_visits_count: profileVisitsByDay.get(day.date) ?? 0,
        // Only YouTube exposes per-day watch time right now. Summed in seconds
        // across every video that got views on this day. Stays 0 for TikTok /
        // IG / FB because Zernio doesn't expose watch-time for those platforms.
        watch_time_seconds: Math.round((ytWatchMinutesByDay.get(day.date) ?? 0) * 60),
        follower_growth_percent: followerStats.growthPercent,
      }));

      const { error: snapshotError } = await adminClient
        .from('platform_snapshots')
        .upsert(rows, { onConflict: 'social_profile_id,snapshot_date' });

      if (snapshotError) {
        result.errors.push(
          `Failed to upsert snapshots for ${platform}: ${snapshotError.message}`,
        );
      }
    }

    if (dailyMetrics.length === 0 && followerStats.followers > 0) {
      const today = new Date().toISOString().split('T')[0];
      await adminClient.from('platform_snapshots').upsert(
        {
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          snapshot_date: today,
          followers_count: followerStats.followers,
          followers_change: followerStats.followerChange,
          follower_growth_percent: followerStats.growthPercent,
        },
        { onConflict: 'social_profile_id,snapshot_date' },
      );
    }

    if (followerStats.series.length > 0) {
      const rows = followerStats.series.map((p) => ({
        social_profile_id: profile.id,
        client_id: clientId,
        platform,
        day: p.date,
        followers: p.followers,
        source: 'zernio' as const,
      }));
      await adminClient
        .from('platform_follower_daily')
        .upsert(rows, { onConflict: 'social_profile_id,day' });
    }

    // Per-post analytics — merge YT video-detail aggregates in here so the
    // post_metrics upsert carries watch time + retention in one write.
    if (posts.length > 0) {
      const postRows = posts.map((p) => {
        const yt = ytAggregates.get(p.postId);
        return {
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          external_post_id: p.postId,
          post_url: p.postUrl,
          thumbnail_url: p.thumbnailUrl,
          caption: p.caption,
          post_type: p.postType,
          published_at: p.publishedAt,
          views_count: p.views ?? p.impressions ?? 0,
          likes_count: p.likes ?? 0,
          comments_count: p.comments ?? 0,
          shares_count: p.shares ?? 0,
          saves_count: p.saves ?? 0,
          reach_count: p.reach ?? 0,
          impressions_count: p.impressions ?? 0,
          watch_time_seconds: yt?.watchSec ?? 0,
          avg_view_duration_seconds: yt?.avgViewDur ?? 0,
          subscribers_gained: yt?.subsG ?? 0,
          subscribers_lost: yt?.subsL ?? 0,
          fetched_at: new Date().toISOString(),
        };
      });

      const { error: postsError } = await adminClient
        .from('post_metrics')
        .upsert(postRows, { onConflict: 'external_post_id,platform' });

      if (postsError) {
        result.errors.push(
          `Failed to upsert posts for ${platform}: ${postsError.message}`,
        );
      } else {
        result.postsCount += posts.length;
      }
    }

    result.platforms.push(platform);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to sync insights for ${platform}: ${message}`);
  }
}

export async function syncClientReporting(
  clientId: string,
  dateRange: DateRange,
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };
  if (!assertZernioKey(result)) return result;

  const adminClient = createAdminClient();
  const { data: profiles, error: profilesError } = await adminClient
    .from('social_profiles')
    .select('id, platform, late_account_id')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .not('late_account_id', 'is', null);

  if (profilesError) {
    result.errors.push(`Failed to fetch social profiles: ${profilesError.message}`);
    return result;
  }
  if (!profiles || profiles.length === 0) return result;

  for (const p of profiles) {
    await syncSocialProfile(p as ProfileRow, clientId, dateRange, result);
  }

  result.synced = result.platforms.length > 0;
  return result;
}

/**
 * Targeted re-pull for a single social_profile, used by the admin
 * "Re-sync" button. Pulls 365 days by default so a reconnect → re-sync
 * flow can rebuild the whole history for that one account without
 * touching sibling platforms.
 */
export async function syncOneProfile(
  profileId: string,
  dateRange?: DateRange,
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };
  if (!assertZernioKey(result)) return result;

  const adminClient = createAdminClient();
  const { data: row, error } = await adminClient
    .from('social_profiles')
    .select('id, client_id, platform, late_account_id, is_active')
    .eq('id', profileId)
    .single();

  if (error || !row) {
    result.errors.push(`Profile not found: ${error?.message ?? profileId}`);
    return result;
  }
  if (!row.late_account_id) {
    result.errors.push(
      `Profile ${row.platform} is not connected to Zernio — reconnect before syncing.`,
    );
    return result;
  }

  const range: DateRange = dateRange ?? {
    start: new Date(Date.now() - 364 * 24 * 3600 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  };

  await syncSocialProfile(
    {
      id: row.id,
      platform: row.platform as SocialPlatform,
      late_account_id: row.late_account_id,
    },
    row.client_id,
    range,
    result,
  );

  result.synced = result.platforms.length > 0;
  return result;
}
