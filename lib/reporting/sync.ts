import { createAdminClient } from '@/lib/supabase/admin';
import { getNormalizer } from './normalizers';
import type { DateRange, SocialPlatform } from '@/lib/types/reporting';

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

  // 1. Query active social profiles for this client
  const { data: profiles, error: profilesError } = await adminClient
    .from('social_profiles')
    .select('id, platform, access_token_ref')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (profilesError) {
    result.errors.push(`Failed to fetch social profiles: ${profilesError.message}`);
    return result;
  }

  if (!profiles || profiles.length === 0) {
    return result;
  }

  const snapshotDate = new Date().toISOString().split('T')[0];

  // 2. Process each profile
  for (const profile of profiles) {
    if (!profile.access_token_ref) {
      result.errors.push(
        `Profile ${profile.id} (${profile.platform}) has no access_token_ref — skipping`,
      );
      continue;
    }

    const platform = profile.platform as SocialPlatform;
    const normalizer = getNormalizer(platform);
    const connectionId = profile.access_token_ref;

    // 2a. Fetch and upsert insights
    try {
      const insights = await normalizer.fetchInsights(connectionId, dateRange);

      const { error: snapshotError } = await adminClient
        .from('platform_snapshots')
        .upsert(
          {
            social_profile_id: profile.id,
            client_id: clientId,
            platform,
            snapshot_date: snapshotDate,
            followers_count: insights.followers,
            followers_change: insights.followersChange,
            views_count: insights.views,
            engagement_count: insights.engagement,
            engagement_rate: insights.engagementRate,
            posts_count: insights.postsCount,
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

    // 2b. Fetch and upsert posts
    try {
      const posts = await normalizer.fetchPosts(connectionId, dateRange);

      if (posts.length > 0) {
        const postRows = posts.map((p) => ({
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          external_post_id: p.externalPostId,
          post_url: p.postUrl,
          thumbnail_url: p.thumbnailUrl,
          caption: p.caption,
          post_type: p.postType,
          published_at: p.publishedAt,
          views_count: p.views,
          likes_count: p.likes,
          comments_count: p.comments,
          shares_count: p.shares,
          saves_count: p.saves,
          reach_count: p.reach,
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
