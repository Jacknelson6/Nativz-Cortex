/**
 * Instagram Graph API client for Business Account analytics.
 *
 * Uses the Meta App Access Token to query the Instagram Graph API.
 * Requires a connected Instagram Business Account via Facebook Page.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0';

export function isInstagramConfigured(): boolean {
  return !!(
    process.env.META_APP_ACCESS_TOKEN &&
    process.env.META_APP_ID
  );
}

function getAccessToken(): string {
  const token = process.env.META_APP_ACCESS_TOKEN;
  if (!token) throw new Error('META_APP_ACCESS_TOKEN not configured');
  return token.trim();
}

async function graphFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_API_BASE}${path}`);
  url.searchParams.set('access_token', getAccessToken());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error('Instagram API error:', error);
    throw new Error(
      error?.error?.message || `Instagram API ${res.status}: ${res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

/** Discover Instagram Business Account IDs linked to the token */
export async function getInstagramAccounts(): Promise<
  Array<{ id: string; name: string; ig_id: string; username: string }>
> {
  // Get pages the token has access to
  const pages = await graphFetch<{
    data: Array<{ id: string; name: string; access_token: string }>;
  }>('/me/accounts');

  const accounts: Array<{ id: string; name: string; ig_id: string; username: string }> = [];

  for (const page of pages.data || []) {
    try {
      const igAccount = await graphFetch<{
        instagram_business_account?: { id: string };
      }>(`/${page.id}`, { fields: 'instagram_business_account' });

      if (igAccount.instagram_business_account?.id) {
        const igId = igAccount.instagram_business_account.id;
        const profile = await graphFetch<{ id: string; username: string }>(`/${igId}`, {
          fields: 'id,username',
        });
        accounts.push({
          id: igId,
          name: page.name,
          ig_id: igId,
          username: profile.username || page.name,
        });
      }
    } catch (e) {
      console.warn(`Could not fetch IG account for page ${page.name}:`, e);
    }
  }

  return accounts;
}

/** Account-level insights (reach, impressions, engagement, follower count) */
export async function getAccountInsights(
  igAccountId: string,
  period: 'day' | 'week' | 'days_28' = 'days_28',
  since?: number,
  until?: number
): Promise<Array<{ name: string; title: string; values: Array<{ value: number; end_time: string }> }>> {
  const metrics = [
    'impressions',
    'reach',
    'accounts_engaged',
    'likes',
    'comments',
    'shares',
    'follows_and_unfollows',
    'profile_views',
  ].join(',');

  const params: Record<string, string> = {
    metric: metrics,
    period,
    metric_type: 'total_value',
  };

  if (since) params.since = String(since);
  if (until) params.until = String(until);

  const data = await graphFetch<{
    data: Array<{
      name: string;
      title: string;
      total_value?: { value: number };
      values: Array<{ value: number; end_time: string }>;
    }>;
  }>(`/${igAccountId}/insights`, params);

  return data.data || [];
}

/** Get recent media with engagement metrics */
export async function getRecentMedia(
  igAccountId: string,
  limit = 25
): Promise<
  Array<{
    id: string;
    caption: string;
    media_type: string;
    timestamp: string;
    like_count: number;
    comments_count: number;
    permalink: string;
    media_url?: string;
    thumbnail_url?: string;
  }>
> {
  const data = await graphFetch<{
    data: Array<{
      id: string;
      caption?: string;
      media_type: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
      permalink: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  }>(`/${igAccountId}/media`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink,media_url,thumbnail_url',
    limit: String(limit),
  });

  return (data.data || []).map((m) => ({
    id: m.id,
    caption: m.caption || '',
    media_type: m.media_type,
    timestamp: m.timestamp,
    like_count: m.like_count ?? 0,
    comments_count: m.comments_count ?? 0,
    permalink: m.permalink,
    media_url: m.media_url,
    thumbnail_url: m.thumbnail_url,
  }));
}

/** Get insights for a specific media item */
export async function getMediaInsights(
  mediaId: string,
  mediaType: string
): Promise<Record<string, number>> {
  // Different metrics available per media type
  let metrics: string;
  if (mediaType === 'VIDEO' || mediaType === 'REELS') {
    metrics = 'impressions,reach,likes,comments,shares,saved,plays,total_interactions';
  } else if (mediaType === 'CAROUSEL_ALBUM') {
    metrics = 'impressions,reach,likes,comments,shares,saved,total_interactions';
  } else {
    metrics = 'impressions,reach,likes,comments,shares,saved,total_interactions';
  }

  try {
    const data = await graphFetch<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(`/${mediaId}/insights`, { metric: metrics });

    const result: Record<string, number> = {};
    for (const metric of data.data || []) {
      result[metric.name] = metric.values?.[0]?.value ?? 0;
    }
    return result;
  } catch {
    return {};
  }
}

/** Audience demographics (age, gender, city, country) */
export async function getAudienceDemographics(
  igAccountId: string
): Promise<{
  age_gender: Record<string, number>;
  cities: Record<string, number>;
  countries: Record<string, number>;
}> {
  const result = {
    age_gender: {} as Record<string, number>,
    cities: {} as Record<string, number>,
    countries: {} as Record<string, number>,
  };

  try {
    const data = await graphFetch<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(`/${igAccountId}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'age,gender',
    });

    for (const metric of data.data || []) {
      if (metric.name === 'follower_demographics') {
        const val = metric.values?.[0]?.value;
        if (val) result.age_gender = val;
      }
    }
  } catch (e) {
    console.warn('Could not fetch age/gender demographics:', e);
  }

  try {
    const data = await graphFetch<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(`/${igAccountId}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'city',
    });

    for (const metric of data.data || []) {
      if (metric.name === 'follower_demographics') {
        const val = metric.values?.[0]?.value;
        if (val) result.cities = val;
      }
    }
  } catch (e) {
    console.warn('Could not fetch city demographics:', e);
  }

  try {
    const data = await graphFetch<{
      data: Array<{
        name: string;
        values: Array<{ value: Record<string, number> }>;
      }>;
    }>(`/${igAccountId}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'country',
    });

    for (const metric of data.data || []) {
      if (metric.name === 'follower_demographics') {
        const val = metric.values?.[0]?.value;
        if (val) result.countries = val;
      }
    }
  } catch (e) {
    console.warn('Could not fetch country demographics:', e);
  }

  return result;
}
