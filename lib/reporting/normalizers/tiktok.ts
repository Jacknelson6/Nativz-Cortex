import { Nango } from '@nangohq/node';
import type {
  PlatformNormalizer,
  NormalizedInsights,
  NormalizedPost,
  DateRange,
} from '@/lib/types/reporting';

const PROVIDER_CONFIG_KEY = 'tiktok-business';

function getNango(): Nango {
  return new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });
}

export const tiktokNormalizer: PlatformNormalizer = {
  platform: 'tiktok',

  async fetchInsights(
    connectionId: string,
    dateRange: DateRange,
  ): Promise<NormalizedInsights> {
    try {
      // Fetch videos and aggregate stats
      const posts = await tiktokNormalizer.fetchPosts(connectionId, dateRange);

      const views = posts.reduce((sum, p) => sum + p.views, 0);
      const totalEngagement = posts.reduce(
        (sum, p) => sum + p.likes + p.comments + p.shares,
        0,
      );
      const engagementRate = views > 0 ? (totalEngagement / views) * 100 : 0;

      return {
        followers: 0, // TikTok Business API doesn't expose follower count in video list
        followersChange: 0,
        views,
        engagement: totalEngagement,
        engagementRate,
        postsCount: posts.length,
      };
    } catch (err) {
      console.error('[TikTok normalizer] Failed to fetch insights:', err);
      return {
        followers: 0,
        followersChange: 0,
        views: 0,
        engagement: 0,
        engagementRate: 0,
        postsCount: 0,
      };
    }
  },

  async fetchPosts(
    connectionId: string,
    dateRange: DateRange,
  ): Promise<NormalizedPost[]> {
    const nango = getNango();

    try {
      const allVideos: NormalizedPost[] = [];
      let cursor = 0;
      let hasMore = true;

      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      while (hasMore) {
        const res = await nango.post<{
          data?: {
            videos?: Array<{
              id: string;
              title?: string;
              cover_image_url?: string;
              share_url?: string;
              create_time?: number;
              play_count?: number;
              digg_count?: number;
              comment_count?: number;
              share_count?: number;
            }>;
            cursor?: number;
            has_more?: boolean;
          };
        }>({
          endpoint: '/video/list/',
          providerConfigKey: PROVIDER_CONFIG_KEY,
          connectionId,
          data: {
            cursor,
            max_count: 20,
          },
        });

        const videos = res.data?.data?.videos ?? [];

        for (const v of videos) {
          const publishedAt = v.create_time
            ? new Date(v.create_time * 1000).toISOString()
            : new Date().toISOString();
          const published = new Date(publishedAt);

          if (published >= startDate && published <= endDate) {
            allVideos.push({
              externalPostId: v.id,
              postUrl: v.share_url ?? null,
              thumbnailUrl: v.cover_image_url ?? null,
              caption: v.title ?? null,
              postType: 'video',
              publishedAt,
              views: v.play_count ?? 0,
              likes: v.digg_count ?? 0,
              comments: v.comment_count ?? 0,
              shares: v.share_count ?? 0,
              saves: 0,
              reach: 0,
            });
          }
        }

        hasMore = res.data?.data?.has_more ?? false;
        cursor = res.data?.data?.cursor ?? 0;

        // Safety: stop after fetching too many pages
        if (allVideos.length > 500) break;
      }

      return allVideos;
    } catch (err) {
      console.error('[TikTok normalizer] Failed to fetch posts:', err);
      return [];
    }
  },
};
