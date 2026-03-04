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
    const data = await lateRequest<{ authUrl: string }>(`/connect/${input.platform}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

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
    }>>('/accounts/list-accounts');

    return (data ?? []).map(p => ({
      id: p.id,
      platform: PLATFORM_MAP[p.platform] ?? p.platform as SocialPlatform,
      platformUserId: p.platformUserId ?? p.id,
      username: p.username ?? '',
      avatarUrl: p.avatarUrl ?? null,
      isActive: p.isActive ?? true,
    }));
  }

  /** Get a presigned upload URL for large video files */
  async getMediaUploadUrl(contentType?: string): Promise<{ uploadUrl: string; publicUrl: string }> {
    const params = contentType ? `?contentType=${encodeURIComponent(contentType)}` : '';
    return lateRequest<{ uploadUrl: string; publicUrl: string }>(
      `/media/get-media-presigned-url${params}`
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

  async getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]> {
    const params = new URLSearchParams({
      accountId: query.accountId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    const data = await lateRequest<{ analytics: PostAnalytics[] }>(
      `/analytics?${params}`
    );
    return data.analytics ?? [];
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
