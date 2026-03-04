import { Nango } from '@nangohq/node';
import type {
  PlatformNormalizer,
  NormalizedInsights,
  NormalizedPost,
  DateRange,
} from '@/lib/types/reporting';

const PROVIDER_CONFIG_KEY = 'facebook-pages';

function getNango(): Nango {
  return new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });
}

export const facebookNormalizer: PlatformNormalizer = {
  platform: 'facebook',

  async fetchInsights(
    connectionId: string,
    dateRange: DateRange,
  ): Promise<NormalizedInsights> {
    const nango = getNango();

    try {
      // Fetch page profile
      const profileRes = await nango.get<{
        followers_count?: number;
        fan_count?: number;
      }>({
        endpoint: '/me',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: { fields: 'followers_count,fan_count' },
      });

      const followers =
        profileRes.data?.followers_count ?? profileRes.data?.fan_count ?? 0;

      // Fetch page insights
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
            metric: 'page_views_total,page_engaged_users',
            period: 'day',
            since: dateRange.start,
            until: dateRange.end,
          },
        });

        const metrics = insightsRes.data?.data ?? [];
        for (const metric of metrics) {
          const total = metric.values.reduce((sum, v) => sum + (v.value ?? 0), 0);
          if (metric.name === 'page_views_total') views = total;
          if (metric.name === 'page_engaged_users') engagement = total;
        }
      } catch (insightsErr) {
        console.error('[Facebook normalizer] Failed to fetch insights:', insightsErr);
      }

      const engagementRate = views > 0 ? (engagement / views) * 100 : 0;

      return {
        followers,
        followersChange: 0,
        views,
        engagement,
        engagementRate,
        postsCount: 0,
      };
    } catch (err) {
      console.error('[Facebook normalizer] Failed to fetch insights:', err);
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
          message?: string;
          full_picture?: string;
          permalink_url?: string;
          created_time?: string;
          likes?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          shares?: { count?: number };
        }>;
      }>({
        endpoint: '/me/posts',
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        params: {
          fields:
            'id,message,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares',
          limit: '100',
        },
      });

      const posts = res.data?.data ?? [];
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      return posts
        .filter((p) => {
          if (!p.created_time) return false;
          const published = new Date(p.created_time);
          return published >= startDate && published <= endDate;
        })
        .map((p) => ({
          externalPostId: p.id,
          postUrl: p.permalink_url ?? null,
          thumbnailUrl: p.full_picture ?? null,
          caption: p.message ?? null,
          postType: 'post',
          publishedAt: p.created_time!,
          views: 0,
          likes: p.likes?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          shares: p.shares?.count ?? 0,
          saves: 0,
          reach: 0,
        }));
    } catch (err) {
      console.error('[Facebook normalizer] Failed to fetch posts:', err);
      return [];
    }
  },
};
