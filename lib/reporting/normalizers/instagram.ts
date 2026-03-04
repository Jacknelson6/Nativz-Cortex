import { Nango } from '@nangohq/node';
import type {
  PlatformNormalizer,
  NormalizedInsights,
  NormalizedPost,
  DateRange,
} from '@/lib/types/reporting';

const PROVIDER_CONFIG_KEY = 'instagram-business';

function getNango(): Nango {
  return new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });
}

export const instagramNormalizer: PlatformNormalizer = {
  platform: 'instagram',

  async fetchInsights(
    connectionId: string,
    dateRange: DateRange,
  ): Promise<NormalizedInsights> {
    const nango = getNango();

    try {
      // Fetch profile info
      const profileRes = await nango.get<{
        followers_count?: number;
        media_count?: number;
      }>({
        endpoint: '/me',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: { fields: 'followers_count,media_count' },
      });

      const followers = profileRes.data?.followers_count ?? 0;
      const postsCount = profileRes.data?.media_count ?? 0;

      // Fetch page insights for the date range
      let views = 0;
      let engagement = 0;

      try {
        const insightsRes = await nango.get<{
          data?: Array<{
            name: string;
            values: Array<{ value: number }>;
          }>;
        }>({
          endpoint: '/me/insights',
          providerConfigKey: PROVIDER_CONFIG_KEY,
          connectionId,
          params: {
            metric: 'impressions,reach',
            period: 'day',
            since: dateRange.start,
            until: dateRange.end,
          },
        });

        const metrics = insightsRes.data?.data ?? [];
        for (const metric of metrics) {
          const total = metric.values.reduce((sum, v) => sum + (v.value ?? 0), 0);
          if (metric.name === 'impressions') views = total;
          if (metric.name === 'reach') engagement = total;
        }
      } catch (insightsErr) {
        console.error('[Instagram normalizer] Failed to fetch insights:', insightsErr);
      }

      const engagementRate = views > 0 ? (engagement / views) * 100 : 0;

      return {
        followers,
        followersChange: 0, // IG API doesn't provide historical follower data directly
        views,
        engagement,
        engagementRate,
        postsCount,
      };
    } catch (err) {
      console.error('[Instagram normalizer] Failed to fetch insights:', err);
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
      const res = await nango.get<{
        data?: Array<{
          id: string;
          caption?: string;
          media_type?: string;
          media_url?: string;
          thumbnail_url?: string;
          permalink?: string;
          timestamp?: string;
          like_count?: number;
          comments_count?: number;
        }>;
      }>({
        endpoint: '/me/media',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: {
          fields:
            'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
          limit: '100',
        },
      });

      const posts = res.data?.data ?? [];
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      return posts
        .filter((p) => {
          if (!p.timestamp) return false;
          const published = new Date(p.timestamp);
          return published >= startDate && published <= endDate;
        })
        .map((p) => ({
          externalPostId: p.id,
          postUrl: p.permalink ?? null,
          thumbnailUrl: p.thumbnail_url ?? p.media_url ?? null,
          caption: p.caption ?? null,
          postType: (p.media_type ?? 'IMAGE').toLowerCase(),
          publishedAt: p.timestamp!,
          views: 0, // IG media endpoint doesn't return views directly
          likes: p.like_count ?? 0,
          comments: p.comments_count ?? 0,
          shares: 0,
          saves: 0,
          reach: 0,
        }));
    } catch (err) {
      console.error('[Instagram normalizer] Failed to fetch posts:', err);
      return [];
    }
  },
};
