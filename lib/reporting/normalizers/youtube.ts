import { Nango } from '@nangohq/node';
import type {
  PlatformNormalizer,
  NormalizedInsights,
  NormalizedPost,
  DateRange,
} from '@/lib/types/reporting';

const PROVIDER_CONFIG_KEY = 'youtube-analytics';

function getNango(): Nango {
  return new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });
}

export const youtubeNormalizer: PlatformNormalizer = {
  platform: 'youtube',

  async fetchInsights(
    connectionId: string,
    dateRange: DateRange,
  ): Promise<NormalizedInsights> {
    const nango = getNango();

    try {
      // Fetch channel statistics
      const channelRes = await nango.get<{
        items?: Array<{
          statistics?: {
            subscriberCount?: string;
            viewCount?: string;
            videoCount?: string;
          };
        }>;
      }>({
        endpoint: '/youtube/v3/channels',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: {
          part: 'statistics,snippet',
          mine: 'true',
        },
      });

      const channel = channelRes.data?.items?.[0];
      const followers = parseInt(channel?.statistics?.subscriberCount ?? '0', 10);
      const totalViews = parseInt(channel?.statistics?.viewCount ?? '0', 10);

      // Fetch posts to compute engagement for the period
      const posts = await youtubeNormalizer.fetchPosts(connectionId, dateRange);
      const periodViews = posts.reduce((sum, p) => sum + p.views, 0);
      const totalEngagement = posts.reduce(
        (sum, p) => sum + p.likes + p.comments,
        0,
      );
      const engagementRate =
        periodViews > 0 ? (totalEngagement / periodViews) * 100 : 0;

      return {
        followers,
        followersChange: 0,
        views: periodViews || totalViews,
        engagement: totalEngagement,
        engagementRate,
        postsCount: posts.length,
      };
    } catch (err) {
      console.error('[YouTube normalizer] Failed to fetch insights:', err);
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
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      // Search for recent shorts/videos
      const searchRes = await nango.get<{
        items?: Array<{
          id?: { videoId?: string };
          snippet?: {
            title?: string;
            publishedAt?: string;
            thumbnails?: { high?: { url?: string } };
          };
        }>;
      }>({
        endpoint: '/youtube/v3/search',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: {
          part: 'snippet',
          forMine: 'true',
          maxResults: '50',
          order: 'date',
          type: 'video',
          videoDuration: 'short',
          publishedAfter: startDate.toISOString(),
          publishedBefore: endDate.toISOString(),
        },
      });

      const searchItems = searchRes.data?.items ?? [];
      if (searchItems.length === 0) return [];

      // Collect video IDs for stats lookup
      const videoIds = searchItems
        .map((item) => item.id?.videoId)
        .filter((id): id is string => !!id);

      if (videoIds.length === 0) return [];

      // Fetch video statistics in batch
      const statsRes = await nango.get<{
        items?: Array<{
          id: string;
          statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
          };
        }>;
      }>({
        endpoint: '/youtube/v3/videos',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: {
          part: 'statistics',
          id: videoIds.join(','),
        },
      });

      const statsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      for (const item of statsRes.data?.items ?? []) {
        statsMap.set(item.id, {
          views: parseInt(item.statistics?.viewCount ?? '0', 10),
          likes: parseInt(item.statistics?.likeCount ?? '0', 10),
          comments: parseInt(item.statistics?.commentCount ?? '0', 10),
        });
      }

      return searchItems
        .filter((item) => {
          if (!item.snippet?.publishedAt) return false;
          const published = new Date(item.snippet.publishedAt);
          return published >= startDate && published <= endDate;
        })
        .map((item) => {
          const videoId = item.id?.videoId ?? '';
          const stats = statsMap.get(videoId) ?? {
            views: 0,
            likes: 0,
            comments: 0,
          };

          return {
            externalPostId: videoId,
            postUrl: `https://www.youtube.com/shorts/${videoId}`,
            thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? null,
            caption: item.snippet?.title ?? null,
            postType: 'short',
            publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: 0,
            saves: 0,
            reach: 0,
          };
        });
    } catch (err) {
      console.error('[YouTube normalizer] Failed to fetch posts:', err);
      return [];
    }
  },
};
