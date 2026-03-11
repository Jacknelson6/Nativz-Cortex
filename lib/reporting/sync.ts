import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
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
  const service = getPostingService();
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };

  // 1. Query active social profiles connected via Late
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

  const snapshotDate = new Date().toISOString().split('T')[0];

  // 2. Process each profile via Late API
  for (const profile of profiles) {
    const platform = profile.platform as SocialPlatform;
    const lateAccountId = profile.late_account_id as string;

    // 2a. Fetch follower stats + daily metrics → platform_snapshots
    try {
      const [followerStats, dailyMetrics] = await Promise.all([
        service.getFollowerStats(lateAccountId),
        service.getDailyMetrics({
          accountId: lateAccountId,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
      ]);

      // Aggregate daily metrics for the snapshot
      let totalViews = 0;
      let totalEngagement = 0;
      let totalPosts = 0;
      let avgEngagementRate = 0;

      if (dailyMetrics.length > 0) {
        for (const day of dailyMetrics) {
          totalViews += day.views ?? day.impressions ?? 0;
          totalEngagement += day.engagement ?? 0;
          totalPosts += day.postsCount ?? 0;
        }
        avgEngagementRate =
          dailyMetrics.reduce((sum, d) => sum + (d.engagementRate ?? 0), 0) /
          dailyMetrics.length;
      }

      const { error: snapshotError } = await adminClient
        .from('platform_snapshots')
        .upsert(
          {
            social_profile_id: profile.id,
            client_id: clientId,
            platform,
            snapshot_date: snapshotDate,
            followers_count: followerStats.followers,
            followers_change: followerStats.followerChange,
            views_count: totalViews,
            engagement_count: totalEngagement,
            engagement_rate: avgEngagementRate,
            posts_count: totalPosts,
          },
          { onConflict: 'social_profile_id,snapshot_date' },
        );

      if (snapshotError) {
        result.errors.push(
          `Failed to upsert snapshot for ${platform}: ${snapshotError.message}`,
        );
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
