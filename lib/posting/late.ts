import type {
  PostingService,
  PublishPostInput,
  PublishResult,
  PostStatusResult,
  ConnectProfileInput,
  ConnectProfileResult,
  SocialProfile,
  SocialPlatform,
  ListPostsQuery,
  LatePost,
  AnalyticsQuery,
  PostAnalytics,
  DailyMetricsQuery,
  DailyMetric,
  FollowerStats,
  PostAnalyticsQuery,
  PostAnalyticsItem,
  LateAnalyticsResponse,
} from './types';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

function getApiKey(): string {
  const key = process.env.LATE_API_KEY;
  if (!key) throw new Error('LATE_API_KEY is not configured');
  return key;
}

async function lateRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${LATE_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Late API error (${response.status}): ${body.substring(0, 300)}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

const PLATFORM_MAP: Record<string, SocialPlatform> = {
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

// Late uses platform-specific config objects per account in the platforms array
function buildPlatformConfig(platform: SocialPlatform, accountId: string, mediaUrl: string, input: PublishPostInput) {
  const config: Record<string, unknown> = {
    id: accountId,
    media: [mediaUrl],
  };

  if (input.customCaption) {
    config.customContent = input.customCaption;
  }

  switch (platform) {
    case 'instagram':
      config.instagram = {
        type: 'REEL',
        ...(input.taggedPeople?.length ? { usersToTag: input.taggedPeople } : {}),
        ...(input.collaboratorHandles?.length ? { collaborators: input.collaboratorHandles } : {}),
      };
      break;
    case 'tiktok':
      config.tiktok = { privacy: 'PUBLIC', aiDisclosure: false };
      break;
    case 'youtube':
      config.youtube = {
        visibility: 'public',
        coppa: false,
        ...(input.coverImageUrl ? { thumbnailUrl: input.coverImageUrl } : {}),
      };
      break;
    case 'facebook':
      // Facebook reels don't need extra config
      break;
  }

  return config;
}

/** Create a Late profile for a client. Returns the profile ID. */
export async function createLateProfile(name: string): Promise<string> {
  const data = await lateRequest<{ profile: { _id: string } }>('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.profile._id;
}

// Cache the analytics response for 60s to avoid redundant API calls
// when sync calls getFollowerStats + getDailyMetrics + getPostAnalytics
let _analyticsCache: { data: LateAnalyticsResponse; ts: number } | null = null;
const ANALYTICS_CACHE_TTL = 60_000;

export class LatePostingService implements PostingService {
  async publishPost(input: PublishPostInput): Promise<PublishResult> {
    const caption = input.hashtags.length > 0
      ? `${input.caption}\n\n${input.hashtags.map(h => `#${h}`).join(' ')}`
      : input.caption;

    // Build per-platform config — Late expects an array of platform objects
    const platforms = input.platformProfileIds.map(profileId => {
      // profileId format: "platform:accountId" or just accountId
      const platform = input.platformHints?.[profileId] ?? 'instagram';
      return buildPlatformConfig(platform, profileId, input.videoUrl, input);
    });

    const body: Record<string, unknown> = {
      content: caption,
      platforms,
    };

    if (input.scheduledAt) {
      body.scheduledFor = input.scheduledAt;
    } else {
      body.publishNow = true;
    }

    const data = await lateRequest<{
      id: string;
      status: string;
      platforms: Array<{
        id: string;
        status: string;
        platformPostUrl?: string;
        error?: string;
      }>;
    }>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      externalPostId: data.id,
      platforms: data.platforms.map(r => ({
        platform: PLATFORM_MAP[r.id] ?? 'instagram' as SocialPlatform,
        profileId: r.id,
        status: mapLateStatus(r.status),
        externalPostId: r.id,
        externalPostUrl: r.platformPostUrl,
        error: r.error,
      })),
    };
  }

  async getPostStatus(externalPostId: string): Promise<PostStatusResult> {
    const data = await lateRequest<{
      id: string;
      platforms: Array<{
        id: string;
        status: string;
        platformPostUrl?: string;
        error?: string;
      }>;
    }>(`/posts/${externalPostId}`);

    return {
      externalPostId: data.id,
      platforms: data.platforms.map(r => ({
        platform: PLATFORM_MAP[r.id] ?? 'instagram' as SocialPlatform,
        profileId: r.id,
        status: mapLateStatus(r.status),
        externalPostId: r.id,
        externalPostUrl: r.platformPostUrl,
        error: r.error,
      })),
    };
  }

  async deletePost(externalPostId: string): Promise<void> {
    await lateRequest(`/posts/${externalPostId}`, { method: 'DELETE' });
  }

  async connectProfile(input: ConnectProfileInput): Promise<ConnectProfileResult> {
    const params = new URLSearchParams({
      redirect_url: input.callbackUrl,
      profileId: input.profileId,
    });
    const data = await lateRequest<{ authUrl: string }>(
      `/connect/${input.platform}?${params}`
    );

    return { authorizationUrl: data.authUrl };
  }

  async disconnectProfile(profileId: string): Promise<void> {
    await lateRequest(`/accounts/${profileId}`, { method: 'DELETE' });
  }

  async getConnectedProfiles(): Promise<SocialProfile[]> {
    const data = await lateRequest<Array<{
      id: string;
      platform: string;
      platformUserId: string;
      username: string;
      avatarUrl: string | null;
      isActive: boolean;
    }>>('/accounts');

    return (data ?? []).map(p => ({
      id: p.id,
      platform: PLATFORM_MAP[p.platform] ?? p.platform as SocialPlatform,
      platformUserId: p.platformUserId ?? p.id,
      username: p.username ?? '',
      avatarUrl: p.avatarUrl ?? null,
      isActive: p.isActive ?? true,
    }));
  }

  /** Get a presigned upload URL for media files (videos + images up to 5GB) */
  async getMediaUploadUrl(contentType?: string, filename?: string): Promise<{ uploadUrl: string; publicUrl: string }> {
    return lateRequest<{ uploadUrl: string; publicUrl: string }>(
      '/media/presign',
      {
        method: 'POST',
        body: JSON.stringify({
          contentType: contentType ?? 'video/mp4',
          filename: filename ?? `upload_${Date.now()}`,
        }),
      }
    );
  }

  async listPosts(query?: ListPostsQuery): Promise<LatePost[]> {
    const params = new URLSearchParams();
    if (query?.platform) params.set('platform', query.platform);
    if (query?.status) params.set('status', query.status);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    const { posts } = await lateRequest<{ posts: LatePost[] }>(
      `/posts${qs ? `?${qs}` : ''}`
    );
    return posts ?? [];
  }

  /**
   * Fetch the unified analytics endpoint.
   * Returns all posts with analytics, plus account follower data.
   * This is the single source of truth — Late's /analytics returns everything.
   */
  async getFullAnalytics(): Promise<LateAnalyticsResponse> {
    if (_analyticsCache && Date.now() - _analyticsCache.ts < ANALYTICS_CACHE_TTL) {
      return _analyticsCache.data;
    }
    const data = await lateRequest<LateAnalyticsResponse>('/analytics');
    _analyticsCache = { data, ts: Date.now() };
    return data;
  }

  async getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]> {
    const data = await this.getFullAnalytics();
    // Filter posts by account and date range, aggregate into PostAnalytics
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some(
        (pl) => pl.accountId === query.accountId,
      );
      if (!matchesAccount) return false;
      const pubDate = (p.publishedAt ?? '').split('T')[0];
      return pubDate >= query.startDate && pubDate <= query.endDate;
    });

    return posts.map((p) => ({
      impressions: p.analytics?.impressions ?? 0,
      engagement: (p.analytics?.likes ?? 0) + (p.analytics?.comments ?? 0) + (p.analytics?.shares ?? 0),
      reach: p.analytics?.reach ?? 0,
      likes: p.analytics?.likes ?? 0,
      comments: p.analytics?.comments ?? 0,
      shares: p.analytics?.shares ?? 0,
      platform: (p.platform ?? 'instagram') as SocialPlatform,
      date: (p.publishedAt ?? '').split('T')[0],
    }));
  }

  async getDailyMetrics(query: DailyMetricsQuery): Promise<DailyMetric[]> {
    const data = await this.getFullAnalytics();
    // Filter posts for this account within date range, group by day
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some(
        (pl) => pl.accountId === query.accountId,
      );
      if (!matchesAccount) return false;
      const pubDate = (p.publishedAt ?? '').split('T')[0];
      return pubDate >= query.startDate && pubDate <= query.endDate;
    });

    const byDay = new Map<string, DailyMetric>();
    for (const p of posts) {
      const day = (p.publishedAt ?? '').split('T')[0];
      if (!day) continue;
      const existing = byDay.get(day) ?? {
        date: day,
        impressions: 0, reach: 0, likes: 0, comments: 0,
        shares: 0, views: 0, engagement: 0, engagementRate: 0, postsCount: 0,
      };
      const a = p.analytics ?? { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0, engagementRate: 0, lastUpdated: null };
      existing.impressions += a.impressions ?? 0;
      existing.reach += a.reach ?? 0;
      existing.likes += a.likes ?? 0;
      existing.comments += a.comments ?? 0;
      existing.shares += a.shares ?? 0;
      existing.views += a.views ?? 0;
      existing.engagement += (a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0) + (a.saves ?? 0);
      existing.postsCount += 1;
      byDay.set(day, existing);
    }

    // Calculate engagement rate per day
    for (const metric of byDay.values()) {
      metric.engagementRate = metric.impressions > 0
        ? (metric.engagement / metric.impressions) * 100
        : 0;
    }

    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFollowerStats(accountId: string): Promise<FollowerStats> {
    const data = await this.getFullAnalytics();
    const account = (data.accounts ?? []).find((a) => a._id === accountId);
    return {
      followers: account?.followersCount ?? 0,
      followerChange: 0, // Late doesn't return change in this endpoint
    };
  }

  async getPostAnalytics(query: PostAnalyticsQuery): Promise<PostAnalyticsItem[]> {
    const data = await this.getFullAnalytics();
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some(
        (pl) => pl.accountId === query.accountId,
      );
      if (!matchesAccount) return false;
      const pubDate = (p.publishedAt ?? '').split('T')[0];
      return pubDate >= query.startDate && pubDate <= query.endDate;
    });

    return posts.map((p) => ({
      postId: p._id,
      platform: (p.platform ?? 'instagram') as SocialPlatform,
      postUrl: p.platformPostUrl ?? null,
      thumbnailUrl: p.thumbnailUrl ?? null,
      caption: p.content ?? null,
      postType: p.mediaType ?? null,
      publishedAt: p.publishedAt ?? null,
      impressions: p.analytics?.impressions ?? 0,
      reach: p.analytics?.reach ?? 0,
      likes: p.analytics?.likes ?? 0,
      comments: p.analytics?.comments ?? 0,
      shares: p.analytics?.shares ?? 0,
      saves: p.analytics?.saves ?? 0,
      views: p.analytics?.views ?? 0,
    }));
  }

  /** Retry a failed post */
  async retryPost(externalPostId: string): Promise<PublishResult> {
    const data = await lateRequest<{
      id: string;
      platforms: Array<{
        id: string;
        status: string;
        platformPostUrl?: string;
        error?: string;
      }>;
    }>(`/posts/${externalPostId}/retry`, { method: 'POST' });

    return {
      externalPostId: data.id,
      platforms: data.platforms.map(r => ({
        platform: PLATFORM_MAP[r.id] ?? 'instagram' as SocialPlatform,
        profileId: r.id,
        status: mapLateStatus(r.status),
        externalPostId: r.id,
        externalPostUrl: r.platformPostUrl,
        error: r.error,
      })),
    };
  }
}

function mapLateStatus(status: string): 'published' | 'scheduled' | 'failed' {
  switch (status) {
    case 'published': return 'published';
    case 'scheduled': return 'scheduled';
    case 'draft': return 'scheduled';
    case 'publishing': return 'scheduled';
    case 'failed':
    case 'error':
    case 'partial':
      return 'failed';
    default: return 'failed';
  }
}
