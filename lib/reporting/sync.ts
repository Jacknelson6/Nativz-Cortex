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

  // Follower stats + daily metrics + IG insights in parallel.
  try {
    const [followerStats, dailyMetrics, igInsights] = await Promise.all([
      service.getFollowerStats(lateAccountId, dateRange.start, dateRange.end),
      service.getDailyMetrics({
        accountId: lateAccountId,
        startDate: dateRange.start,
        endDate: dateRange.end,
      }),
      platform === 'instagram'
        ? zernio.getInstagramInsights(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve({ profileVisits: [], reachSeries: [] }),
    ]);

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
      const rows = dailyMetrics.map((day) => ({
        social_profile_id: profile.id,
        client_id: clientId,
        platform,
        snapshot_date: day.date,
        followers_count: followerForDay(day.date),
        followers_change: 0,
        views_count: day.views,
        engagement_count: day.engagement,
        engagement_rate: day.engagementRate,
        posts_count: day.postsCount,
        reach_count: igReachByDay.get(day.date) ?? day.reach,
        impressions_count: day.impressions,
        link_clicks_count: day.clicks,
        profile_visits_count: profileVisitsByDay.get(day.date) ?? 0,
        watch_time_seconds: 0,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to sync insights for ${platform}: ${message}`);
  }

  // Per-post analytics → post_metrics.
  try {
    const posts = await service.getPostAnalytics({
      accountId: lateAccountId,
      startDate: dateRange.start,
      endDate: dateRange.end,
    });

    if (posts.length > 0) {
      const postRows = posts.map((p) => ({
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
        fetched_at: new Date().toISOString(),
      }));

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
    result.errors.push(`Failed to sync posts for ${platform}: ${message}`);
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
