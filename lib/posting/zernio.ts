/**
 * Zernio posting + analytics (formerly Late / getlate.dev).
 * @see https://docs.zernio.com/
 * @see docs/zernio-setup.md — env vars, webhook URL, Vercel redeploy checklist
 */

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
  LateAnalyticsPost,
  LateAnalyticsAccount,
} from './types';

const DEFAULT_BASE = 'https://zernio.com/api/v1';

const ANALYTICS_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'tiktok',
  'facebook',
  'youtube',
];

export function getZernioApiBase(): string {
  return (process.env.ZERNIO_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
}

export function getZernioApiKey(): string {
  const key = process.env.ZERNIO_API_KEY ?? process.env.LATE_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      'ZERNIO_API_KEY is not set. Add it in Zernio (Settings → API keys). Legacy LATE_API_KEY is still accepted.',
    );
  }
  return key.trim();
}

async function zernioRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getZernioApiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getZernioApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zernio API error (${response.status}): ${body.substring(0, 300)}`);
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

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function pickNum(obj: Record<string, unknown> | null, key: string): number {
  if (!obj) return 0;
  const v = obj[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

/** Normalise an audience-insights bucket array across the shapes Zernio may return. */
function toBuckets(
  raw: unknown,
  nameKey: string,
): Array<{ name: string; percent: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; percent: number }> = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const name = pickString(r, nameKey, 'label', 'name');
    if (!name) continue;
    const percent = pickNum(r, 'percent') || pickNum(r, 'percentage') || pickNum(r, 'share');
    out.push({ name, percent });
  }
  return out;
}

/** Create a Zernio profile for a client (stored as clients.late_profile_id). */
export async function createZernioProfile(name: string): Promise<string> {
  const data = await zernioRequest<Record<string, unknown>>('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const profile = asRecord(data.profile) ?? asRecord(data.data);
  const id = profile ? pickString(profile, '_id', 'id') : null;
  if (id) return id;
  throw new Error('Zernio create profile: missing profile id in response');
}

/**
 * @deprecated Renamed to createZernioProfile; kept for imports until DB columns are renamed.
 */
export const createLateProfile = createZernioProfile;

// Cache merged analytics (same pattern as former Late client).
let _analyticsCache: { data: LateAnalyticsResponse; ts: number } | null = null;
const ANALYTICS_CACHE_TTL = 60_000;
const ANALYTICS_LOOKBACK_DAYS = 120;

/** Map a Zernio analytics post payload into the shape used by reporting + velocity. */
function mapZernioAnalyticsPost(raw: unknown): LateAnalyticsPost | null {
  const p = asRecord(raw);
  if (!p) return null;
  const id = pickString(p, '_id', 'id');
  if (!id) return null;

  const analyticsRaw = asRecord(p.analytics);
  const platformsIn = Array.isArray(p.platforms) ? p.platforms : [];
  const platforms = platformsIn.map((pl) => {
    const pr = asRecord(pl) ?? {};
    const a = asRecord(pr.analytics);
    return {
      platform: pickString(pr, 'platform') ?? 'unknown',
      status: pickString(pr, 'status') ?? 'unknown',
      accountId: pickString(pr, 'accountId', 'account_id') ?? '',
      accountUsername: pickString(pr, 'accountUsername', 'account_username') ?? '',
      analytics: a
        ? {
            impressions: pickNum(a, 'impressions'),
            reach: pickNum(a, 'reach'),
            likes: pickNum(a, 'likes'),
            comments: pickNum(a, 'comments'),
            shares: pickNum(a, 'shares'),
            saves: pickNum(a, 'saves'),
            clicks: pickNum(a, 'clicks'),
            views: pickNum(a, 'views'),
            engagementRate: pickNum(a, 'engagementRate'),
          }
        : null,
    };
  });

  return {
    _id: id,
    content: pickString(p, 'content'),
    publishedAt: pickString(p, 'publishedAt', 'published_at'),
    scheduledFor: pickString(p, 'scheduledFor', 'scheduled_for'),
    status: pickString(p, 'status') ?? 'unknown',
    platform: pickString(p, 'platform') ?? 'instagram',
    platformPostUrl: pickString(p, 'platformPostUrl', 'platform_post_url', 'postUrl', 'url'),
    thumbnailUrl: pickString(p, 'thumbnailUrl', 'thumbnail_url', 'thumbnail'),
    mediaType: pickString(p, 'mediaType', 'media_type'),
    profileId: pickString(p, 'profileId', 'profile_id'),
    isExternal: Boolean(p.isExternal ?? p.is_external),
    analytics: analyticsRaw
      ? {
          impressions: pickNum(analyticsRaw, 'impressions'),
          reach: pickNum(analyticsRaw, 'reach'),
          likes: pickNum(analyticsRaw, 'likes'),
          comments: pickNum(analyticsRaw, 'comments'),
          shares: pickNum(analyticsRaw, 'shares'),
          saves: pickNum(analyticsRaw, 'saves'),
          clicks: pickNum(analyticsRaw, 'clicks'),
          views: pickNum(analyticsRaw, 'views'),
          engagementRate: pickNum(analyticsRaw, 'engagementRate'),
          lastUpdated: pickString(analyticsRaw, 'lastUpdated', 'last_updated'),
        }
      : null,
    platforms,
    mediaItems: undefined,
  };
}

function mapZernioAccount(raw: unknown): LateAnalyticsAccount | null {
  const a = asRecord(raw);
  if (!a) return null;
  const id = pickString(a, '_id', 'id');
  if (!id) return null;
  return {
    _id: id,
    platform: pickString(a, 'platform') ?? '',
    username: pickString(a, 'username') ?? '',
    followersCount: pickNum(a, 'followersCount') || pickNum(a, 'followers_count'),
  };
}

async function fetchMergedAnalytics(): Promise<LateAnalyticsResponse> {
  const fromDate = isoDateDaysAgo(ANALYTICS_LOOKBACK_DAYS);
  const toDate = todayIsoDate();

  const results = await Promise.all(
    ANALYTICS_PLATFORMS.map(async (platform) => {
      try {
        const params = new URLSearchParams({ platform, fromDate, toDate });
        return await zernioRequest<unknown>(`/analytics?${params}`);
      } catch {
        return null;
      }
    }),
  );

  const postById = new Map<string, LateAnalyticsPost>();
  const accountById = new Map<string, LateAnalyticsAccount>();

  for (const chunk of results) {
    if (!chunk) continue;
    const root = asRecord(chunk) ?? {};
    const postsRaw = root.posts ?? root.data;
    const accountsRaw = root.accounts;

    if (Array.isArray(postsRaw)) {
      for (const item of postsRaw) {
        const mapped = mapZernioAnalyticsPost(item);
        if (mapped) postById.set(mapped._id, mapped);
      }
    }

    if (Array.isArray(accountsRaw)) {
      for (const item of accountsRaw) {
        const mapped = mapZernioAccount(item);
        if (mapped) accountById.set(mapped._id, mapped);
      }
    }
  }

  const posts = Array.from(postById.values());
  const accounts = Array.from(accountById.values());

  return {
    overview: {
      totalPosts: posts.length,
      publishedPosts: posts.filter((p) => p.status === 'published').length,
      scheduledPosts: posts.filter((p) => p.status === 'scheduled').length,
      lastSync: new Date().toISOString(),
    },
    posts,
    pagination: { page: 1, limit: posts.length, total: posts.length, pages: 1 },
    accounts,
    hasAnalyticsAccess: posts.length > 0 || accounts.length > 0,
  };
}

function buildPublishBody(input: PublishPostInput): Record<string, unknown> {
  const caption =
    input.hashtags.length > 0
      ? `${input.caption}\n\n${input.hashtags.map((h) => `#${h}`).join(' ')}`
      : input.caption;

  const hasTiktok = input.platformProfileIds.some(
    (id) => (input.platformHints?.[id] ?? 'instagram') === 'tiktok',
  );

  const mediaItem: Record<string, unknown> = {
    type: 'video',
    url: input.videoUrl,
  };
  if (input.coverImageUrl) {
    mediaItem.thumbnail = input.coverImageUrl;
  }

  const platforms = input.platformProfileIds.map((accountId) => {
    const platform = input.platformHints?.[accountId] ?? 'instagram';
    const entry: Record<string, unknown> = { platform, accountId };
    if (input.customCaption) {
      entry.customContent = input.customCaption;
    }

    if (platform === 'instagram') {
      entry.platformSpecificData = {
        contentType: 'reels',
        shareToFeed: true,
        ...(input.taggedPeople?.length ? { usersToTag: input.taggedPeople } : {}),
        ...(input.collaboratorHandles?.length ? { collaborators: input.collaboratorHandles } : {}),
      };
    } else if (platform === 'youtube') {
      const title =
        caption.split('\n')[0]?.slice(0, 100)?.trim() || 'Video';
      entry.platformSpecificData = {
        title,
        visibility: 'public',
        madeForKids: false,
      };
    }

    return entry;
  });

  const body: Record<string, unknown> = {
    content: caption,
    mediaItems: [mediaItem],
    platforms,
  };

  if (hasTiktok) {
    body.tiktokSettings = {
      privacy_level: 'PUBLIC_TO_EVERYONE',
      allow_comment: true,
      allow_duet: true,
      allow_stitch: true,
      ...(input.coverImageUrl ? { video_cover_image_url: input.coverImageUrl } : {}),
      content_preview_confirmed: true,
      express_consent_given: true,
    };
  }

  if (input.scheduledAt) {
    body.scheduledFor = input.scheduledAt;
  } else {
    body.publishNow = true;
  }

  return body;
}

function unwrapPostPayload(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  if (!r) return {};
  const inner = asRecord(r.post);
  return inner ?? r;
}

function mapPublishPlatforms(
  raw: unknown,
): Array<{
  id?: string;
  accountId?: string;
  platform?: string;
  status?: string;
  platformPostUrl?: string;
  error?: string;
}> {
  const post = unwrapPostPayload(raw);
  const pl = post.platforms;
  if (!Array.isArray(pl)) return [];
  return pl.map((x) => {
    const o = asRecord(x) ?? {};
    return {
      id: pickString(o, 'id', '_id') ?? undefined,
      accountId: pickString(o, 'accountId', 'account_id') ?? undefined,
      platform: pickString(o, 'platform') ?? undefined,
      status: pickString(o, 'status') ?? undefined,
      platformPostUrl:
        pickString(o, 'platformPostUrl', 'platform_post_url', 'url') ?? undefined,
      error: pickString(o, 'error', 'message') ?? undefined,
    };
  });
}

function mapPlatformRow(r: {
  id?: string;
  accountId?: string;
  platform?: string;
  status?: string;
  platformPostUrl?: string;
  error?: string;
}): PublishResult['platforms'][0] {
  const plat = PLATFORM_MAP[r.platform ?? ''] ?? ('instagram' as SocialPlatform);
  const profileId = r.accountId ?? r.id ?? '';
  return {
    platform: plat,
    profileId,
    status: mapZernioStatus(r.status ?? ''),
    externalPostId: r.id ?? r.accountId,
    externalPostUrl: r.platformPostUrl,
    error: r.error,
  };
}

export class ZernioPostingService implements PostingService {
  async publishPost(input: PublishPostInput): Promise<PublishResult> {
    const body = buildPublishBody(input);
    const raw = await zernioRequest<unknown>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const post = unwrapPostPayload(raw);
    const externalPostId = pickString(post, '_id', 'id') ?? '';
    const rows = mapPublishPlatforms(raw);

    return {
      externalPostId,
      platforms: rows.map(mapPlatformRow),
    };
  }

  async getPostStatus(externalPostId: string): Promise<PostStatusResult> {
    const raw = await zernioRequest<unknown>(`/posts/${externalPostId}`);
    const rows = mapPublishPlatforms(raw);
    return {
      externalPostId,
      platforms: rows.map(mapPlatformRow),
    };
  }

  async deletePost(externalPostId: string): Promise<void> {
    await zernioRequest(`/posts/${externalPostId}`, { method: 'DELETE' });
  }

  async connectProfile(input: ConnectProfileInput): Promise<ConnectProfileResult> {
    const params = new URLSearchParams({
      profileId: input.profileId,
      redirect_url: input.callbackUrl,
    });
    const data = await zernioRequest<Record<string, unknown>>(
      `/connect/${input.platform}?${params}`,
    );
    const url =
      (typeof data.authUrl === 'string' && data.authUrl) ||
      (typeof data.auth_url === 'string' && data.auth_url) ||
      (typeof data.authorizationUrl === 'string' && data.authorizationUrl) ||
      '';
    if (!url) {
      throw new Error('Zernio connect: missing auth URL in response');
    }
    return { authorizationUrl: url };
  }

  /** Exchange OAuth code for connected account (headless mode). POST /v1/connect/{platform} */
  async exchangeOAuthCode(input: {
    code: string;
    state: string;
    profileId: string;
    platform: string;
  }): Promise<{ account: { id: string; platform: string; username: string; displayName?: string } }> {
    const data = await zernioRequest<Record<string, unknown>>(
      `/connect/${input.platform}`,
      {
        method: 'POST',
        body: JSON.stringify({
          code: input.code,
          state: input.state,
          profileId: input.profileId,
        }),
      },
    );
    const account = asRecord(data.account) ?? asRecord(data.data);
    if (!account) {
      throw new Error('Zernio OAuth callback: missing account in response');
    }
    return {
      account: {
        id: pickString(account, 'accountId', 'id', '_id') ?? '',
        platform: pickString(account, 'platform') ?? input.platform,
        username: pickString(account, 'username') ?? '',
        displayName: pickString(account, 'displayName', 'display_name') ?? undefined,
      },
    };
  }

  /** List Facebook pages after OAuth (headless mode). GET /v1/connect/facebook/select-page */
  async listFacebookPages(profileId: string, tempToken: string): Promise<Array<{ id: string; name: string; username?: string }>> {
    const params = new URLSearchParams({ profileId, tempToken });
    const data = await zernioRequest<Record<string, unknown>>(
      `/connect/facebook/select-page?${params}`,
    );
    const pages = Array.isArray(data.pages) ? data.pages : [];
    return pages.map((item: unknown) => {
      const p = asRecord(item) ?? {};
      return {
        id: pickString(p, 'id', '_id') ?? '',
        name: pickString(p, 'name') ?? '',
        username: pickString(p, 'username') ?? undefined,
      };
    });
  }

  /** Select a Facebook page to complete headless connection. POST /v1/connect/facebook/select-page */
  async selectFacebookPage(input: { profileId: string; pageId: string; tempToken: string }): Promise<void> {
    await zernioRequest('/connect/facebook/select-page', {
      method: 'POST',
      body: JSON.stringify({
        profileId: input.profileId,
        pageId: input.pageId,
        tempToken: input.tempToken,
      }),
    });
  }

  async disconnectProfile(profileId: string): Promise<void> {
    await zernioRequest(`/accounts/${profileId}`, { method: 'DELETE' });
  }

  async getConnectedProfiles(): Promise<SocialProfile[]> {
    const raw = await zernioRequest<unknown>('/accounts');
    const list = Array.isArray(raw)
      ? raw
      : (asRecord(raw)?.accounts as unknown[] | undefined) ?? [];

    return list.map((item) => {
      const o = asRecord(item) ?? {};
      const id = pickString(o, '_id', 'id') ?? '';
      const platformStr = pickString(o, 'platform') ?? 'instagram';
      return {
        id,
        platform: PLATFORM_MAP[platformStr] ?? (platformStr as SocialPlatform),
        platformUserId: pickString(o, 'platformUserId', 'platform_user_id') ?? id,
        username: pickString(o, 'username') ?? '',
        avatarUrl: pickString(o, 'avatarUrl', 'avatar_url', 'avatar'),
        isActive: o.isActive !== false && o.is_active !== false,
      };
    });
  }

  async getMediaUploadUrl(
    contentType?: string,
    filename?: string,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const fileType = contentType ?? 'video/mp4';
    const fileName = filename ?? `upload_${Date.now()}`;
    return zernioRequest<{ uploadUrl: string; publicUrl: string }>('/media/presign', {
      method: 'POST',
      body: JSON.stringify({ filename: fileName, contentType: fileType }),
    });
  }

  async listPosts(query?: ListPostsQuery): Promise<LatePost[]> {
    const params = new URLSearchParams();
    if (query?.platform) params.set('platform', query.platform);
    if (query?.status) params.set('status', query.status);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    const raw = await zernioRequest<unknown>(`/posts${qs ? `?${qs}` : ''}`);
    const root = asRecord(raw) ?? {};
    const posts = (root.posts as unknown[] | undefined) ?? (Array.isArray(raw) ? raw : []);

    return posts.map((item): LatePost => {
      const p = asRecord(item) ?? {};
      const id = pickString(p, '_id', 'id') ?? '';
      const platformsRaw = Array.isArray(p.platforms) ? p.platforms : [];
      return {
        id,
        content: pickString(p, 'content') ?? '',
        status: pickString(p, 'status') ?? '',
        scheduledFor: pickString(p, 'scheduledFor', 'scheduled_for'),
        publishedAt: pickString(p, 'publishedAt', 'published_at'),
        platforms: platformsRaw.map((pl) => {
          const x = asRecord(pl) ?? {};
          return {
            platform: pickString(x, 'platform') ?? '',
            accountId: pickString(x, 'accountId', 'account_id') ?? '',
            status: pickString(x, 'status') ?? '',
            platformPostUrl:
              pickString(x, 'platformPostUrl', 'platform_post_url', 'url') ?? undefined,
            error: pickString(x, 'error') ?? undefined,
          };
        }),
        mediaItems: undefined,
        createdAt: pickString(p, 'createdAt', 'created_at') ?? new Date().toISOString(),
      };
    });
  }

  async getFullAnalytics(): Promise<LateAnalyticsResponse> {
    if (_analyticsCache && Date.now() - _analyticsCache.ts < ANALYTICS_CACHE_TTL) {
      return _analyticsCache.data;
    }
    const data = await fetchMergedAnalytics();
    _analyticsCache = { data, ts: Date.now() };
    return data;
  }

  async getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]> {
    const data = await this.getFullAnalytics();
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some((pl) => pl.accountId === query.accountId);
      if (!matchesAccount) return false;
      const pubDate = (p.publishedAt ?? '').split('T')[0];
      return pubDate >= query.startDate && pubDate <= query.endDate;
    });

    return posts.map((p) => ({
      impressions: p.analytics?.impressions ?? 0,
      engagement:
        (p.analytics?.likes ?? 0) +
        (p.analytics?.comments ?? 0) +
        (p.analytics?.shares ?? 0),
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
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some((pl) => pl.accountId === query.accountId);
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
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        engagement: 0,
        engagementRate: 0,
        postsCount: 0,
      };
      const a = p.analytics ?? {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
        engagementRate: 0,
        lastUpdated: null,
      };
      existing.impressions += a.impressions ?? 0;
      existing.reach += a.reach ?? 0;
      existing.likes += a.likes ?? 0;
      existing.comments += a.comments ?? 0;
      existing.shares += a.shares ?? 0;
      existing.views += a.views ?? 0;
      existing.engagement +=
        (a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0) + (a.saves ?? 0);
      existing.postsCount += 1;
      byDay.set(day, existing);
    }

    for (const metric of byDay.values()) {
      metric.engagementRate =
        metric.impressions > 0 ? (metric.engagement / metric.impressions) * 100 : 0;
    }

    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFollowerStats(accountId: string): Promise<FollowerStats> {
    const data = await this.getFullAnalytics();
    const account = (data.accounts ?? []).find((a) => a._id === accountId);
    return {
      followers: account?.followersCount ?? 0,
      followerChange: 0,
    };
  }

  async getPostAnalytics(query: PostAnalyticsQuery): Promise<PostAnalyticsItem[]> {
    const data = await this.getFullAnalytics();
    const posts = (data.posts ?? []).filter((p) => {
      const matchesAccount = p.platforms?.some((pl) => pl.accountId === query.accountId);
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

  /**
   * Fetch audience insights (demographics, reach, impressions) for an account.
   * Returns `null` when the endpoint 404s — some Zernio plans / platforms don't
   * expose this data. Callers should treat null as "unavailable", not as an
   * error.
   */
  async getAudienceInsights(accountId: string): Promise<{
    followersTotal: number | null;
    followersCountry: Array<{ name: string; percent: number }>;
    followersCity: Array<{ name: string; percent: number }>;
    followersAge: Array<{ name: string; percent: number }>;
    followersGender: Array<{ name: string; percent: number }>;
    reach: number | null;
    impressions: number | null;
  } | null> {
    const paths = [
      `/accounts/${accountId}/audience`,
      `/insights/account?accountId=${encodeURIComponent(accountId)}`,
    ];

    for (const path of paths) {
      try {
        const raw = await zernioRequest<unknown>(path);
        const root = asRecord(raw);
        if (!root) continue;
        const data = asRecord(root.audience) ?? asRecord(root.data) ?? root;

        return {
          followersTotal:
            pickNum(data, 'followersTotal') || pickNum(data, 'followers') || null,
          followersCountry: toBuckets(data.countries ?? data.country, 'code'),
          followersCity: toBuckets(data.cities ?? data.city, 'name'),
          followersAge: toBuckets(data.ageBuckets ?? data.age, 'bucket'),
          followersGender: toBuckets(data.gender, 'gender'),
          reach: pickNum(data, 'reach') || null,
          impressions: pickNum(data, 'impressions') || null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('501')) {
          continue; // try next path
        }
        console.warn(`[zernio] audience insights failed for ${accountId}:`, msg);
        return null;
      }
    }
    return null;
  }

  /**
   * Daily follower counts for the last N days. Falls back to `null` when
   * Zernio doesn't expose this endpoint — the caller can synthesize the series
   * from our own platform_snapshots history.
   */
  async getFollowerTimeSeries(
    accountId: string,
    days = 30,
  ): Promise<Array<{ date: string; followers: number }> | null> {
    try {
      const raw = await zernioRequest<unknown>(
        `/accounts/${accountId}/followers?days=${days}`,
      );
      const root = asRecord(raw);
      const list =
        (root?.series as unknown[] | undefined) ??
        (root?.data as unknown[] | undefined) ??
        (Array.isArray(raw) ? (raw as unknown[]) : []);
      if (!Array.isArray(list) || list.length === 0) return null;
      return list
        .map((item) => {
          const r = asRecord(item);
          if (!r) return null;
          const date = pickString(r, 'date', 'day', 'timestamp');
          if (!date) return null;
          const followers = pickNum(r, 'followers') || pickNum(r, 'count');
          return { date: date.split('T')[0], followers };
        })
        .filter((x): x is { date: string; followers: number } => x !== null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] follower series failed for ${accountId}:`, msg);
      }
      return null;
    }
  }

  async retryPost(externalPostId: string): Promise<PublishResult> {
    const raw = await zernioRequest<unknown>(`/posts/${externalPostId}/retry`, {
      method: 'POST',
    });
    const post = unwrapPostPayload(raw);
    const id = pickString(post, '_id', 'id') ?? externalPostId;
    const rows = mapPublishPlatforms(raw);
    return {
      externalPostId: id,
      platforms: rows.map(mapPlatformRow),
    };
  }
}

function mapZernioStatus(status: string): 'published' | 'scheduled' | 'failed' {
  switch (status) {
    case 'published':
      return 'published';
    case 'scheduled':
      return 'scheduled';
    case 'draft':
      return 'scheduled';
    case 'publishing':
      return 'scheduled';
    case 'failed':
    case 'error':
    case 'partial':
      return 'failed';
    default:
      return 'failed';
  }
}
