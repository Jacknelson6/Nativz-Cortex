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

export async function syncClientReporting(
  clientId: string,
  dateRange: DateRange,
): Promise<SyncResult> {
  const adminClient = createAdminClient();
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };

  if (!process.env.ZERNIO_API_KEY?.trim() && !process.env.LATE_API_KEY?.trim()) {
    result.errors.push(
      'Social reporting sync skipped: ZERNIO_API_KEY is not set. Create a key in Zernio (Settings → API keys). Docs: https://docs.zernio.com/ — legacy LATE_API_KEY is still accepted during migration.',
    );
    return result;
  }

  const service = getPostingService();
  const zernio = new ZernioPostingService();

  // 1. Query active social profiles connected via Zernio
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

  if (!profiles || profiles.length === 0) {
    return result;
  }

  // 2. Process each profile via Zernio API
  for (const profile of profiles) {
    const platform = profile.platform as SocialPlatform;
    const lateAccountId = profile.late_account_id as string;

    // 2a. Fetch follower stats + daily metrics + IG-specific insights in parallel.
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

      // Map follower series + IG series by date for quick lookup when
      // building per-day snapshot rows.
      const followersByDay = new Map<string, number>();
      for (const p of followerStats.series) followersByDay.set(p.date, p.followers);

      const profileVisitsByDay = new Map<string, number>();
      for (const p of igInsights.profileVisits) profileVisitsByDay.set(p.date, p.value);

      // Prefer IG's time-series reach when present; otherwise the value
      // from /daily-metrics already lives on each DailyMetric row.
      const igReachByDay = new Map<string, number>();
      for (const p of igInsights.reachSeries) igReachByDay.set(p.date, p.value);

      // Write one snapshot row per day in the window so the summary API
      // can aggregate without double-counting.
      if (dailyMetrics.length > 0) {
        const rows = dailyMetrics.map((day) => ({
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          snapshot_date: day.date,
          followers_count: followersByDay.get(day.date) ?? 0,
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

      // Record the latest-known follower count as a single-row marker even
      // when daily-metrics is empty (e.g. an account with no recent posts).
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

      // Mirror the follower series into platform_follower_daily so the
      // existing follower-growth chart keeps working. Prefer the real
      // Zernio series; fall back to the 30-day endpoint only if empty.
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

    // 2b. Fetch per-post analytics → post_metrics
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

  result.synced = result.platforms.length > 0;
  return result;
}
