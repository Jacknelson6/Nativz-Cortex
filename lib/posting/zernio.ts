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
  InstagramInsights,
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
  'linkedin',
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

async function zernioRequest<T>(path: string, options: RequestInit = {}, retryAttempt = 0): Promise<T> {
  const response = await fetch(`${getZernioApiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getZernioApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Rate-limited — Zernio returns `retryAfterSeconds` in the body. We honor
  // that up to 3 times; beyond that, surface the error so the caller logs it
  // instead of blocking forever.
  if (response.status === 429 && retryAttempt < 3) {
    const body = await response.text();
    let waitSeconds = 3;
    try {
      const parsed = JSON.parse(body) as { details?: { retryAfterSeconds?: number } };
      if (typeof parsed.details?.retryAfterSeconds === 'number') {
        waitSeconds = parsed.details.retryAfterSeconds;
      }
    } catch {
      /* use default */
    }
    await new Promise((r) => setTimeout(r, (waitSeconds + 0.5) * 1000));
    return zernioRequest<T>(path, options, retryAttempt + 1);
  }

  // Transient upstream failures. Zernio fans out to Meta / TikTok / YouTube
  // and frequently returns 500 / 502 / 503 / 504 when an upstream blip
  // happens (e.g. "Failed to fetch analytics posts for charts" surfacing as
  // a 500 from the /analytics endpoint when Meta times out). Retry with
  // exponential backoff so a one-off blip during the twice-daily cron
  // doesn't generate a false-positive sync_failed notification.
  if (
    (response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504) &&
    retryAttempt < 3
  ) {
    const backoffSeconds = Math.pow(2, retryAttempt) * 1.5; // 1.5s, 3s, 6s
    await new Promise((r) => setTimeout(r, backoffSeconds * 1000));
    return zernioRequest<T>(path, options, retryAttempt + 1);
  }

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
const ANALYTICS_LOOKBACK_DAYS = 365;

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
      platformPostId: pickString(pr, 'platformPostId', 'platform_post_id'),
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
    thumbnailUrl: pickString(
      p,
      'thumbnailUrl',
      'thumbnail_url',
      'thumbnail',
      'coverImageUrl',
      'cover_image_url',
      'coverUrl',
      'cover_url',
      'cover',
      'previewUrl',
      'preview_url',
    ),
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

/**
 * Instagram silently drops captions with >30 hashtags. Zernio rejects them
 * pre-flight with a 400 (this is the message Skibell hit for 5 of 6 stuck
 * recovered drafts). Cap the appended hashtag list so the total (inline #word
 * tokens in the caption + appended) stays at or below `limit`. Inline tokens
 * include things like address suite numbers ("#110") which IG counts.
 */
function capHashtagsForCaption(
  caption: string,
  hashtags: string[],
  limit = 30,
): string[] {
  const inline = (caption.match(/(^|[\s.,;:!?\-])#[A-Za-z0-9_]+/g) ?? []).length;
  const room = Math.max(0, limit - inline);
  return hashtags.slice(0, room);
}

/** Parse a Zernio 409 dup-detection error and return the existing post ID, if any. */
function parseZernioDuplicate(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const m = err.message.match(/Zernio API error \(409\): (\{[\s\S]*)/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as { details?: { existingPostId?: string } };
    return parsed.details?.existingPostId ?? null;
  } catch {
    return null;
  }
}

function buildPublishBody(input: PublishPostInput): Record<string, unknown> {
  const cappedHashtags = capHashtagsForCaption(input.caption, input.hashtags);
  const caption =
    cappedHashtags.length > 0
      ? `${input.caption}\n\n${cappedHashtags.map((h) => `#${h}`).join(' ')}`
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
    const variant = input.captionByPlatform?.[platform]?.trim();
    if (variant) {
      entry.customContent = variant;
    }

    if (platform === 'instagram') {
      entry.platformSpecificData = {
        contentType: 'reels',
        // Default to true — most clients want the cross-post. Overrides
        // only flip false when explicitly disabled (e.g. brands that
        // gate the grid manually).
        shareToFeed: input.instagramShareToFeed ?? true,
        ...(input.taggedPeople?.length ? { usersToTag: input.taggedPeople } : {}),
        ...(input.collaboratorHandles?.length ? { collaborators: input.collaboratorHandles } : {}),
      };
    } else if (platform === 'youtube') {
      // Title precedence: explicit override → first line of caption →
      // fallback string. YouTube rejects empty titles, so we always
      // ship something. 100-char hard cap matches YouTube's API limit.
      const fallbackTitle =
        caption.split('\n')[0]?.slice(0, 100)?.trim() || 'Video';
      const title = (input.youtubeTitle?.trim().slice(0, 100)) || fallbackTitle;

      const description = input.youtubeDescription?.trim() || caption;
      const tagPool = input.youtubeTags?.length ? input.youtubeTags : input.hashtags;
      const tags = tagPool
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean);

      const visibilityMap: Record<NonNullable<PublishPostInput['youtubePrivacy']>, string> = {
        public: 'public',
        unlisted: 'unlisted',
        private: 'private',
      };

      entry.platformSpecificData = {
        title,
        description,
        ...(tags.length ? { tags } : {}),
        visibility: visibilityMap[input.youtubePrivacy ?? 'public'],
        madeForKids: input.youtubeMadeForKids ?? false,
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
    // privacy_level + content_preview_confirmed + express_consent_given
    // are protocol requirements — Zernio rejects the call without them
    // — so they stay hardcoded. The interaction toggles below ARE
    // user-facing per migration 218; default to true to preserve
    // existing behavior when the override is unset.
    body.tiktokSettings = {
      privacy_level: 'PUBLIC_TO_EVERYONE',
      allow_comment: input.tiktokAllowComment ?? true,
      allow_duet: input.tiktokAllowDuet ?? true,
      allow_stitch: input.tiktokAllowStitch ?? true,
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
    let raw: unknown;
    try {
      raw = await zernioRequest<unknown>('/posts', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Zernio dedup: if the same content is already scheduled / published on
      // this account in the last 24h, it returns 409 with `details.existingPostId`.
      // That post IS in Zernio, so the caller's draft is effectively recovered:
      // adopt the existing ID instead of re-throwing.
      const reused = parseZernioDuplicate(err);
      if (reused) {
        return { externalPostId: reused, platforms: [] };
      }
      throw err;
    }
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

  /**
   * GET /v1/analytics/daily-metrics — real daily aggregates per account.
   * Replaces the previous implementation that synthesized daily rows by
   * grouping post-level analytics by publish date (which only yielded data
   * on days a post shipped and double-counted lifetime impressions).
   */
  async getDailyMetrics(query: DailyMetricsQuery): Promise<DailyMetric[]> {
    const params = new URLSearchParams({
      accountId: query.accountId,
      fromDate: query.startDate,
      toDate: query.endDate,
    });
    const raw = await zernioRequest<unknown>(`/analytics/daily-metrics?${params}`);
    const root = asRecord(raw) ?? {};
    const dailyData = Array.isArray(root.dailyData) ? root.dailyData : [];

    const out: DailyMetric[] = [];
    for (const item of dailyData) {
      const r = asRecord(item);
      if (!r) continue;
      const date = (pickString(r, 'date', 'day') ?? '').split('T')[0];
      if (!date) continue;

      const m = asRecord(r.metrics) ?? r;
      const impressions = pickNum(m, 'impressions');
      const reach = pickNum(m, 'reach');
      const likes = pickNum(m, 'likes');
      const comments = pickNum(m, 'comments');
      const shares = pickNum(m, 'shares');
      const saves = pickNum(m, 'saves');
      const clicks = pickNum(m, 'clicks');
      const views = pickNum(m, 'views');
      const engagement = likes + comments + shares + saves;
      const postsCount = pickNum(r, 'postCount') || pickNum(r, 'postsCount');

      out.push({
        date,
        impressions,
        reach,
        likes,
        comments,
        shares,
        saves,
        clicks,
        views,
        engagement,
        engagementRate: impressions > 0 ? (engagement / impressions) * 100 : 0,
        postsCount,
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * GET /v1/accounts/follower-stats — real follower counts + daily series.
   * Supplies currentFollowers, absolute growth, growth%, and per-day series
   * for charting. Replaces the old implementation that pulled followers off
   * the post-analytics `/analytics` response (which often omits accounts).
   */
  async getFollowerStats(
    accountId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<FollowerStats> {
    const params = new URLSearchParams({
      accountIds: accountId,
      granularity: 'daily',
    });
    if (startDate) params.set('fromDate', startDate);
    if (endDate) params.set('toDate', endDate);

    try {
      const raw = await zernioRequest<unknown>(`/accounts/follower-stats?${params}`);
      const root = asRecord(raw) ?? {};
      const accounts = Array.isArray(root.accounts) ? root.accounts : [];
      const account: Record<string, unknown> | null = accounts
        .map((a) => asRecord(a))
        .find((a) => a && (a._id === accountId || a.accountId === accountId)) ?? null;

      const statsRoot = asRecord(root.stats) ?? {};
      const rawSeries = statsRoot[accountId];
      const series = Array.isArray(rawSeries)
        ? rawSeries
            .map((p) => {
              const r = asRecord(p);
              if (!r) return null;
              const date = (pickString(r, 'date', 'day') ?? '').split('T')[0];
              if (!date) return null;
              return { date, followers: pickNum(r, 'followers') || pickNum(r, 'count') };
            })
            .filter((x): x is { date: string; followers: number } => x !== null)
        : [];

      return {
        followers:
          pickNum(account, 'currentFollowers') ||
          pickNum(account, 'followersCount') ||
          pickNum(account, 'followers'),
        followerChange: pickNum(account, 'growth') || pickNum(account, 'followerChange'),
        growthPercent:
          pickNum(account, 'growthPercentage') || pickNum(account, 'growthPercent'),
        series,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 402 = analytics add-on required, 404 = unsupported — degrade gracefully.
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] follower-stats failed for ${accountId}: ${msg}`);
      }
      return { followers: 0, followerChange: 0, growthPercent: 0, series: [] };
    }
  }

  /**
   * GET /v1/analytics/instagram/account-insights — IG-only metrics that don't
   * surface via /daily-metrics. Reach supports time_series so we pull it
   * as per-day arrays; profile_links_taps only returns total_value so we
   * fetch that separately and synthesize a single-bucket series. Path
   * uses a slash (`instagram/account-insights`) — the hyphenated form
   * from the docs' llms.txt is wrong and silently 404s.
   */
  async getInstagramInsights(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<InstagramInsights> {
    const reachParams = new URLSearchParams({
      accountId,
      metrics: 'reach',
      since: startDate,
      until: endDate,
      metricType: 'time_series',
    });
    const linksParams = new URLSearchParams({
      accountId,
      metrics: 'profile_links_taps',
      since: startDate,
      until: endDate,
      metricType: 'total_value',
    });
    try {
      const [rawReach, rawLinks] = await Promise.all([
        zernioRequest<unknown>(`/analytics/instagram/account-insights?${reachParams}`).catch(() => null),
        zernioRequest<unknown>(`/analytics/instagram/account-insights?${linksParams}`).catch(() => null),
      ]);
      const root = asRecord(rawReach) ?? {};
      const metrics = asRecord(root.metrics) ?? {};

      const toSeries = (key: string) => {
        const entry = asRecord(metrics[key]);
        if (!entry) return [];
        const values = Array.isArray(entry.values) ? entry.values : [];
        return values
          .map((v) => {
            const r = asRecord(v);
            if (!r) return null;
            const date = (pickString(r, 'date') ?? '').split('T')[0];
            if (!date) return null;
            return { date, value: pickNum(r, 'value') };
          })
          .filter((x): x is { date: string; value: number } => x !== null);
      };

      // profile_links_taps only supports total_value, not time_series.
      // Synthesise a single-bucket series on the end date so the UI
      // still has a data point to render.
      const linksRoot = asRecord(rawLinks) ?? {};
      const linksMetrics = asRecord(linksRoot.metrics) ?? {};
      const taps = asRecord(linksMetrics.profile_links_taps);
      const totalTaps = pickNum(taps, 'total') || pickNum(taps, 'value');
      const profileVisits = totalTaps > 0 ? [{ date: endDate, value: totalTaps }] : [];

      return {
        profileVisits,
        reachSeries: toSeries('reach'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] IG insights failed for ${accountId}: ${msg}`);
      }
      return { profileVisits: [], reachSeries: [] };
    }
  }

  /**
   * GET /v1/analytics/instagram/account-insights — MBS-style account-wide
   * window totals (Views / Reach / Content interactions / Follows / Visits).
   *
   * These come from Instagram Graph API at the account level — they count
   * every event that happened in the account during the window, including
   * views of older evergreen content and follow events on the profile
   * itself. This is what Meta Business Suite displays. Our per-post sums
   * from `getPostAnalytics` undercount because they only see posts that
   * published inside the window.
   *
   * Two requests because Zernio's endpoint only breaks down one metric at
   * a time, and `follows_and_unfollows` requires `breakdown=follow_type`
   * to split gross follows from unfollows. Both calls fail soft — missing
   * analytics add-on or unsupported account types 404/402 gracefully.
   */
  async getInstagramAccountMetrics(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    views: number;
    reach: number;
    accountsEngaged: number;
    totalInteractions: number;
    profileLinksTaps: number;
    newFollows: number;
    unfollows: number;
  } | null> {
    const totalsParams = new URLSearchParams({
      accountId,
      metrics: 'views,reach,accounts_engaged,total_interactions,profile_links_taps',
      since: startDate,
      until: endDate,
      metricType: 'total_value',
    });
    const followsParams = new URLSearchParams({
      accountId,
      metrics: 'follows_and_unfollows',
      since: startDate,
      until: endDate,
      metricType: 'total_value',
      breakdown: 'follow_type',
    });

    try {
      const [rawTotals, rawFollows] = await Promise.all([
        zernioRequest<unknown>(`/analytics/instagram/account-insights?${totalsParams}`).catch(() => null),
        zernioRequest<unknown>(`/analytics/instagram/account-insights?${followsParams}`).catch(() => null),
      ]);

      const totalsMetrics = asRecord(asRecord(rawTotals)?.metrics) ?? {};
      const pickTotal = (key: string): number => {
        const entry = asRecord(totalsMetrics[key]);
        return pickNum(entry, 'total') || pickNum(entry, 'value');
      };

      let newFollows = 0;
      let unfollows = 0;
      const followsMetrics = asRecord(asRecord(rawFollows)?.metrics) ?? {};
      const followsEntry = asRecord(followsMetrics.follows_and_unfollows);
      if (followsEntry) {
        const breakdowns = Array.isArray(followsEntry.breakdowns) ? followsEntry.breakdowns : [];
        for (const b of breakdowns) {
          const r = asRecord(b);
          if (!r) continue;
          const dim = (pickString(r, 'dimension') ?? '').toUpperCase();
          const val = pickNum(r, 'value');
          // Meta returns the confusingly-labeled FOLLOWER / NON_FOLLOWER pair.
          // Live probe against Weston Funding (MBS showed 44 follows) confirmed
          // FOLLOWER = new follows and NON_FOLLOWER = unfollows.
          if (dim === 'FOLLOWER') newFollows = val;
          else if (dim === 'NON_FOLLOWER') unfollows = val;
        }
      }

      return {
        views: pickTotal('views'),
        reach: pickTotal('reach'),
        accountsEngaged: pickTotal('accounts_engaged'),
        totalInteractions: pickTotal('total_interactions'),
        profileLinksTaps: pickTotal('profile_links_taps'),
        newFollows,
        unfollows,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] IG account metrics failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * GET /v1/analytics/facebook/page-insights — page-level window totals.
   *
   * Meta deprecated `page_fan_adds` and `page_fan_removes`, so Zernio
   * synthesises `followers_gained` / `followers_lost` from the daily
   * follower count delta server-side. Other metrics come straight from
   * the Page Insights API. All values are window aggregates — written to
   * the end-of-window snapshot row.
   */
  async getFacebookPageInsights(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    followersGained: number;
    followersLost: number;
    impressions: number;
    impressionsUnique: number;
    pageViews: number;
    postEngagements: number;
    videoViews: number;
    videoViewSeconds: number;
  } | null> {
    const params = new URLSearchParams({ accountId, since: startDate, until: endDate });
    try {
      const raw = await zernioRequest<unknown>(`/analytics/facebook/page-insights?${params}`);
      const root = asRecord(raw) ?? {};
      const metrics = asRecord(root.metrics) ?? root;
      const pickWindow = (...keys: string[]): number => {
        for (const k of keys) {
          const v = metrics[k];
          if (typeof v === 'number') return v;
          const entry = asRecord(v);
          if (!entry) continue;
          const t =
            pickNum(entry, 'total') ||
            pickNum(entry, 'value') ||
            pickNum(entry, 'sum');
          if (t) return t;
        }
        return 0;
      };
      return {
        followersGained: pickWindow('followers_gained', 'followersGained'),
        followersLost: pickWindow('followers_lost', 'followersLost'),
        impressions: pickWindow('page_impressions', 'impressions'),
        impressionsUnique: pickWindow('page_impressions_unique', 'impressions_unique'),
        pageViews: pickWindow('page_views_total', 'page_views', 'pageViews'),
        postEngagements: pickWindow('page_post_engagements', 'post_engagements', 'engagements'),
        videoViews: pickWindow('page_video_views', 'video_views'),
        videoViewSeconds: pickWindow('page_video_view_time', 'video_view_time'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] FB page insights failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * GET /v1/analytics/youtube/channel-insights — channel-level window
   * aggregates. Studio's impressions / CTR are NOT exposed by the YouTube
   * Analytics API for any principal — that's a Google-side gap, not a
   * Zernio one. We render an honest empty state for those metrics.
   */
  async getYoutubeChannelInsights(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    views: number;
    watchTimeMinutes: number;
    subscribersGained: number;
    subscribersLost: number;
    averageViewDuration: number;
  } | null> {
    const params = new URLSearchParams({ accountId, since: startDate, until: endDate });
    try {
      const raw = await zernioRequest<unknown>(`/analytics/youtube/channel-insights?${params}`);
      const root = asRecord(raw) ?? {};
      const metrics = asRecord(root.metrics) ?? root;
      return {
        views: pickNum(metrics, 'views') || pickNum(metrics, 'totalViews'),
        watchTimeMinutes:
          pickNum(metrics, 'estimatedMinutesWatched') ||
          pickNum(metrics, 'watchTimeMinutes') ||
          pickNum(metrics, 'watch_time_minutes'),
        subscribersGained:
          pickNum(metrics, 'subscribersGained') || pickNum(metrics, 'subscribers_gained'),
        subscribersLost:
          pickNum(metrics, 'subscribersLost') || pickNum(metrics, 'subscribers_lost'),
        averageViewDuration:
          pickNum(metrics, 'averageViewDuration') || pickNum(metrics, 'average_view_duration'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] YT channel insights failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * GET /v1/analytics/linkedin/org-aggregate-analytics — org-level window
   * aggregates. Returns 412 Precondition Failed when the connected account
   * lacks `r_organization_social` / `r_organization_followers` /
   * `r_organization_admin` scopes or ADMINISTRATOR role on the page; the
   * response includes a `reauthUrl` we surface to the UI so the admin can
   * fix it without leaving the dashboard.
   */
  async getLinkedInOrgAggregateAnalytics(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<
    | {
        ok: true;
        impressions: number;
        clicks: number;
        engagementRate: number;
        followerGains: number;
        pageViews: number;
        pageViewsByPage: Record<string, number>;
      }
    | { ok: false; needsReauth: true; reauthUrl: string | null }
    | null
  > {
    const params = new URLSearchParams({ accountId, since: startDate, until: endDate });
    try {
      const raw = await zernioRequest<unknown>(`/analytics/linkedin/org-aggregate-analytics?${params}`);
      const root = asRecord(raw) ?? {};
      const metrics = asRecord(root.metrics) ?? root;
      const byPageRaw = asRecord(metrics.pageViewsByPage) ?? asRecord(metrics.page_views_by_page) ?? {};
      const pageViewsByPage: Record<string, number> = {};
      for (const [k, v] of Object.entries(byPageRaw)) {
        if (typeof v === 'number') pageViewsByPage[k] = v;
        else {
          const r = asRecord(v);
          if (r) pageViewsByPage[k] = pickNum(r, 'value') || pickNum(r, 'total');
        }
      }
      return {
        ok: true,
        impressions: pickNum(metrics, 'impressions'),
        clicks: pickNum(metrics, 'clicks'),
        engagementRate:
          pickNum(metrics, 'engagementRate') || pickNum(metrics, 'engagement_rate'),
        followerGains:
          pickNum(metrics, 'followerGains') ||
          pickNum(metrics, 'follower_gains') ||
          pickNum(metrics, 'followersGained'),
        pageViews: pickNum(metrics, 'pageViews') || pickNum(metrics, 'page_views'),
        pageViewsByPage,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('412')) {
        // Surface the re-auth link if Zernio included one so the admin UI
        // can prompt the connected user to grant the missing scopes.
        let reauthUrl: string | null = null;
        const match = msg.match(/"reauthUrl"\s*:\s*"([^"]+)"/);
        if (match) reauthUrl = match[1];
        return { ok: false, needsReauth: true, reauthUrl };
      }
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] LI org analytics failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * GET /v1/analytics/tiktok/account-insights — current-state account
   * snapshot (follower / following / likes / video counts). NOT window-
   * aggregated; this is what's true at fetch time. TikTok's public API
   * does NOT expose profile_views, watch time, impression sources, or
   * account-level impressions / reach for any principal — those stay
   * unavailable on Cortex and render as honest empty states.
   */
  async getTikTokAccountInsights(
    accountId: string,
  ): Promise<{
    followerCount: number;
    followingCount: number;
    likesCount: number;
    videoCount: number;
  } | null> {
    try {
      const raw = await zernioRequest<unknown>(
        `/analytics/tiktok/account-insights?accountId=${encodeURIComponent(accountId)}`,
      );
      const root = asRecord(raw) ?? {};
      const metrics = asRecord(root.metrics) ?? asRecord(root.data) ?? root;
      return {
        followerCount:
          pickNum(metrics, 'followerCount') ||
          pickNum(metrics, 'follower_count') ||
          pickNum(metrics, 'followers'),
        followingCount:
          pickNum(metrics, 'followingCount') || pickNum(metrics, 'following_count'),
        likesCount:
          pickNum(metrics, 'likesCount') ||
          pickNum(metrics, 'likes_count') ||
          pickNum(metrics, 'likes'),
        videoCount:
          pickNum(metrics, 'videoCount') ||
          pickNum(metrics, 'video_count') ||
          pickNum(metrics, 'videos'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] TT account insights failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * GET /v1/analytics/instagram/follower-history — daily follower count
   * series. IG only returns `total_value` for `follows_and_unfollows`, so
   * per-day follow / unfollow split is impossible. The series we get is
   * the absolute follower count per day, which we persist into
   * `platform_follower_daily` so the chart can render an actual curve
   * instead of guessing from the most recent point.
   */
  async getInstagramFollowerHistory(
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; followers: number }> | null> {
    const params = new URLSearchParams({ accountId, since: startDate, until: endDate });
    try {
      const raw = await zernioRequest<unknown>(`/analytics/instagram/follower-history?${params}`);
      const root = asRecord(raw);
      const list =
        (root?.series as unknown[] | undefined) ??
        (root?.data as unknown[] | undefined) ??
        (root?.history as unknown[] | undefined) ??
        (Array.isArray(raw) ? (raw as unknown[]) : []);
      if (!Array.isArray(list) || list.length === 0) return null;
      return list
        .map((item) => {
          const r = asRecord(item);
          if (!r) return null;
          const date = pickString(r, 'date', 'day', 'timestamp');
          if (!date) return null;
          const followers =
            pickNum(r, 'followers') ||
            pickNum(r, 'count') ||
            pickNum(r, 'value') ||
            pickNum(r, 'total');
          return { date: date.split('T')[0], followers };
        })
        .filter((x): x is { date: string; followers: number } => x !== null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && !msg.includes('404') && !msg.includes('501')) {
        console.warn(`[zernio] IG follower history failed for ${accountId}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Per-account paginated pull of /v1/analytics. Bypasses the 120-day
   * `fetchMergedAnalytics` cache so historical backfills see every indexed
   * post. Zernio caps each query at 100 results/page and 1-year range.
   *
   * Pulls source=all so both Zernio-published and externally-imported
   * (platform-native) posts are captured. Zernio has ~6.3K external posts
   * already indexed across our workspace that we previously ignored.
   */
  async getPostAnalytics(query: PostAnalyticsQuery): Promise<PostAnalyticsItem[]> {
    const out: PostAnalyticsItem[] = [];
    const LIMIT = 100;
    const MAX_PAGES = 20; // safety cap; 20 * 100 = 2000 posts per account
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        accountId: query.accountId,
        source: 'all',
        fromDate: query.startDate,
        toDate: query.endDate,
        limit: String(LIMIT),
        page: String(page),
      });
      let root: Record<string, unknown> = {};
      try {
        const raw = await zernioRequest<unknown>(`/analytics?${params}`);
        root = asRecord(raw) ?? {};
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[zernio] /analytics page ${page} for ${query.accountId}: ${msg}`);
        break;
      }
      const postsRaw = Array.isArray(root.posts)
        ? root.posts
        : Array.isArray(root.data)
          ? root.data
          : [];

      for (const item of postsRaw) {
        const mapped = mapZernioAnalyticsPost(item);
        if (!mapped) continue;
        // A post can include multiple platform entries; use the one that
        // matches our accountId so analytics reflect this account's stats.
        const platformEntry = mapped.platforms?.find((pl) => pl.accountId === query.accountId);
        const analytics = platformEntry?.analytics ?? mapped.analytics;
        out.push({
          postId: mapped._id,
          platformPostId: platformEntry?.platformPostId ?? null,
          platform: (platformEntry?.platform ?? mapped.platform ?? 'instagram') as SocialPlatform,
          postUrl: mapped.platformPostUrl ?? null,
          thumbnailUrl: mapped.thumbnailUrl ?? null,
          caption: mapped.content ?? null,
          postType: mapped.mediaType ?? null,
          publishedAt: mapped.publishedAt ?? null,
          impressions: analytics?.impressions ?? 0,
          reach: analytics?.reach ?? 0,
          likes: analytics?.likes ?? 0,
          comments: analytics?.comments ?? 0,
          shares: analytics?.shares ?? 0,
          saves: analytics?.saves ?? 0,
          views: analytics?.views ?? 0,
        });
      }

      if (postsRaw.length < LIMIT) break;
    }
    return out;
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

  /**
   * GET /v1/accounts/{id}/health — per-account health (token validity,
   * permissions, recommended actions).
   */
  async getAccountHealth(accountId: string): Promise<{
    status: string;
    platform: string;
    username: string | null;
    tokenValid: boolean;
    tokenExpiresAt: string | null;
    tokenExpiresIn: string | null;
    needsRefresh: boolean;
    raw: Record<string, unknown>;
  } | null> {
    try {
      const raw = await zernioRequest<unknown>(`/accounts/${accountId}/health`);
      const root = asRecord(raw);
      if (!root) return null;
      const token = asRecord(root.tokenStatus) ?? {};
      return {
        status: pickString(root, 'status') ?? 'unknown',
        platform: pickString(root, 'platform') ?? '',
        username: pickString(root, 'username') ?? null,
        tokenValid: token.valid === true,
        tokenExpiresAt: pickString(token, 'expiresAt') ?? null,
        tokenExpiresIn: pickString(token, 'expiresIn') ?? null,
        needsRefresh: token.needsRefresh === true,
        raw: root,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] health ${accountId}:`, msg);
      return null;
    }
  }

  /**
   * GET /v1/analytics/post-timeline?postId=… — per-post engagement timeline
   * (hourly engagement accumulation). Returns null when the post isn't
   * indexed yet. Used for drill-down on a single high-performing post.
   */
  async getPostTimeline(
    postId: string,
  ): Promise<Array<{ timestamp: string; impressions: number; engagement: number }>> {
    try {
      const raw = await zernioRequest<unknown>(
        `/analytics/post-timeline?postId=${encodeURIComponent(postId)}`,
      );
      const root = asRecord(raw) ?? {};
      const tl = Array.isArray(root.timeline)
        ? root.timeline
        : Array.isArray(root.data)
          ? root.data
          : [];
      return tl
        .map((p) => {
          const r = asRecord(p);
          if (!r) return null;
          return {
            timestamp: pickString(r, 'timestamp', 'date', 'time') ?? '',
            impressions: pickNum(r, 'impressions'),
            engagement: pickNum(r, 'engagement'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.timestamp !== '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] post-timeline ${postId}:`, msg);
      return [];
    }
  }

  /**
   * GET /v1/analytics/instagram/demographics — follower age/city/country/
   * gender distribution (requires ≥100 followers).
   */
  async getInstagramDemographics(
    accountId: string,
  ): Promise<{
    age: Array<{ dimension: string; value: number }>;
    country: Array<{ dimension: string; value: number }>;
    city: Array<{ dimension: string; value: number }>;
    gender: Array<{ dimension: string; value: number }>;
  }> {
    const breakdowns = ['age', 'country', 'city', 'gender'] as const;
    const result: Record<string, Array<{ dimension: string; value: number }>> = {
      age: [], country: [], city: [], gender: [],
    };
    await Promise.all(
      breakdowns.map(async (bd) => {
        try {
          const qs = new URLSearchParams({ accountId, breakdown: bd });
          const raw = await zernioRequest<unknown>(`/analytics/instagram/demographics?${qs}`);
          const root = asRecord(raw) ?? {};
          const demo = asRecord(root.demographics) ?? {};
          const bucket = Array.isArray(demo[bd]) ? demo[bd] : [];
          result[bd] = bucket
            .map((b) => {
              const r = asRecord(b);
              if (!r) return null;
              return {
                dimension: pickString(r, 'dimension') ?? '',
                value: pickNum(r, 'value'),
              };
            })
            .filter((x): x is { dimension: string; value: number } => x !== null && x.dimension !== '');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('404') && !msg.includes('402')) {
            console.warn(`[zernio] IG demographics ${bd} for ${accountId}:`, msg);
          }
        }
      }),
    );
    return { age: result.age, country: result.country, city: result.city, gender: result.gender };
  }

  /** GET /v1/analytics/youtube/demographics — age / gender / country distributions. */
  async getYoutubeDemographics(
    accountId: string,
  ): Promise<{
    age: Array<{ dimension: string; value: number }>;
    gender: Array<{ dimension: string; value: number }>;
    country: Array<{ dimension: string; value: number }>;
  }> {
    try {
      const qs = new URLSearchParams({ accountId });
      const raw = await zernioRequest<unknown>(`/analytics/youtube/demographics?${qs}`);
      const root = asRecord(raw) ?? {};
      const demo = asRecord(root.demographics) ?? {};
      const toRows = (arr: unknown) => {
        if (!Array.isArray(arr)) return [];
        return arr
          .map((a) => {
            const r = asRecord(a);
            if (!r) return null;
            return { dimension: pickString(r, 'dimension') ?? '', value: pickNum(r, 'value') };
          })
          .filter((x): x is { dimension: string; value: number } => x !== null && x.dimension !== '');
      };
      return { age: toRows(demo.age), gender: toRows(demo.gender), country: toRows(demo.country) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('402')) {
        console.warn(`[zernio] YT demographics ${accountId}:`, msg);
      }
      return { age: [], gender: [], country: [] };
    }
  }

  /**
   * GET /v1/analytics/youtube/daily-views — per-video daily view counts
   * with watch time + subs gained/lost. Requires a videoId.
   */
  async getYoutubeDailyViews(
    accountId: string,
    videoId: string,
  ): Promise<Array<{
    date: string;
    views: number;
    estimatedMinutesWatched: number;
    averageViewDuration: number;
    subscribersGained: number;
    subscribersLost: number;
  }>> {
    try {
      const qs = new URLSearchParams({ accountId, videoId });
      const raw = await zernioRequest<unknown>(`/analytics/youtube/daily-views?${qs}`);
      const root = asRecord(raw) ?? {};
      const rows = Array.isArray(root.dailyViews) ? root.dailyViews : [];
      return rows
        .map((r) => {
          const o = asRecord(r);
          if (!o) return null;
          return {
            date: (pickString(o, 'date') ?? '').split('T')[0],
            views: pickNum(o, 'views'),
            estimatedMinutesWatched: pickNum(o, 'estimatedMinutesWatched'),
            averageViewDuration: pickNum(o, 'averageViewDuration'),
            subscribersGained: pickNum(o, 'subscribersGained'),
            subscribersLost: pickNum(o, 'subscribersLost'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.date !== '')
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] YT daily-views ${videoId}:`, msg);
      return [];
    }
  }

  /** GET /v1/accounts/{id}/linkedin-organizations — orgs the account can post to. */
  async getLinkedInOrganizations(
    accountId: string,
  ): Promise<Array<{ id: string; urn: string; name: string; vanityName: string; logoUrl: string | null }>> {
    try {
      const raw = await zernioRequest<unknown>(`/accounts/${accountId}/linkedin-organizations`);
      const root = asRecord(raw) ?? {};
      const orgs = Array.isArray(root.organizations) ? root.organizations : [];
      return orgs
        .map((o) => {
          const r = asRecord(o);
          if (!r) return null;
          return {
            id: pickString(r, 'id') ?? '',
            urn: pickString(r, 'urn') ?? '',
            name: pickString(r, 'name') ?? '',
            vanityName: pickString(r, 'vanityName') ?? '',
            logoUrl: pickString(r, 'logoUrl'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.id !== '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] LI orgs ${accountId}:`, msg);
      return [];
    }
  }

  /** GET /v1/accounts/{id}/linkedin-post-analytics?urn=… — per-post LinkedIn analytics. */
  async getLinkedInPostAnalytics(
    accountId: string,
    urn: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const qs = new URLSearchParams({ urn });
      const raw = await zernioRequest<unknown>(
        `/accounts/${accountId}/linkedin-post-analytics?${qs}`,
      );
      return asRecord(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] LI post-analytics:`, msg);
      return null;
    }
  }

  /** GET /v1/accounts/{id}/linkedin-post-reactions?urn=… — reaction breakdown. */
  async getLinkedInPostReactions(
    accountId: string,
    urn: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const qs = new URLSearchParams({ urn });
      const raw = await zernioRequest<unknown>(
        `/accounts/${accountId}/linkedin-post-reactions?${qs}`,
      );
      return asRecord(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] LI post-reactions:`, msg);
      return null;
    }
  }

  /**
   * GET /v1/accounts/{id}/tiktok/creator-info — handle, avatar, verification,
   * canPostMore flag, allowed privacy levels. Path uses a slash, not hyphen.
   */
  async getTikTokCreatorInfo(
    accountId: string,
  ): Promise<{
    nickname: string;
    avatarUrl: string | null;
    isVerified: boolean;
    canPostMore: boolean;
    privacyLevels: Array<{ value: string; label: string }>;
  } | null> {
    try {
      const raw = await zernioRequest<unknown>(`/accounts/${accountId}/tiktok/creator-info`);
      const root = asRecord(raw) ?? {};
      const creator = asRecord(root.creator);
      if (!creator) return null;
      const levels = Array.isArray(root.privacyLevels) ? root.privacyLevels : [];
      return {
        nickname: pickString(creator, 'nickname') ?? '',
        avatarUrl: pickString(creator, 'avatarUrl'),
        isVerified: creator.isVerified === true,
        canPostMore: creator.canPostMore === true,
        privacyLevels: levels
          .map((l) => {
            const o = asRecord(l);
            if (!o) return null;
            return { value: pickString(o, 'value') ?? '', label: pickString(o, 'label') ?? '' };
          })
          .filter((x): x is { value: string; label: string } => x !== null && x.value !== ''),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn(`[zernio] TT creator-info ${accountId}:`, msg);
      return null;
    }
  }

  /** GET /v1/analytics/best-time — day-of-week × hour slots ranked by engagement. */
  async getBestTime(filters?: {
    platform?: SocialPlatform;
    profileId?: string;
    accountId?: string;
  }): Promise<Array<{ dayOfWeek: number; hour: number; avgEngagement: number; postCount: number }>> {
    const params = new URLSearchParams();
    if (filters?.platform) params.set('platform', filters.platform);
    if (filters?.profileId) params.set('profileId', filters.profileId);
    if (filters?.accountId) params.set('accountId', filters.accountId);
    const qs = params.toString();
    try {
      const raw = await zernioRequest<unknown>(`/analytics/best-time${qs ? `?${qs}` : ''}`);
      const root = asRecord(raw) ?? {};
      const slots = Array.isArray(root.slots) ? root.slots : [];
      return slots
        .map((s) => {
          const r = asRecord(s);
          if (!r) return null;
          return {
            dayOfWeek: pickNum(r, 'day_of_week'),
            hour: pickNum(r, 'hour'),
            avgEngagement: pickNum(r, 'avg_engagement'),
            postCount: pickNum(r, 'post_count'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn('[zernio] best-time:', msg);
      return [];
    }
  }

  /** GET /v1/analytics/googlebusiness/performance — views/calls/directions by day. */
  async getGoogleBusinessPerformance(
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<Record<string, unknown> | null> {
    const params = new URLSearchParams({ accountId });
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    try {
      const raw = await zernioRequest<unknown>(`/analytics/googlebusiness/performance?${params}`);
      return asRecord(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn('[zernio] GMB performance:', msg);
      return null;
    }
  }

  /** GET /v1/analytics/googlebusiness/search-keywords — search queries driving the listing. */
  async getGoogleBusinessSearchKeywords(
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<Array<{ keyword: string; count: number }>> {
    const params = new URLSearchParams({ accountId });
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    try {
      const raw = await zernioRequest<unknown>(`/analytics/googlebusiness/search-keywords?${params}`);
      const root = asRecord(raw) ?? {};
      const rows = Array.isArray(root.keywords)
        ? root.keywords
        : Array.isArray(root.data)
          ? root.data
          : [];
      return rows
        .map((r) => {
          const o = asRecord(r);
          if (!o) return null;
          return {
            keyword: pickString(o, 'keyword', 'query', 'term') ?? '',
            count: pickNum(o, 'count') || pickNum(o, 'value'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.keyword !== '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn('[zernio] GMB keywords:', msg);
      return [];
    }
  }

  /** GET /v1/accounts/{id}/facebook-page — available FB pages for this connection. */
  async getFacebookPages(
    accountId: string,
  ): Promise<Array<{ id: string; name: string; category: string; fanCount: number }>> {
    try {
      const raw = await zernioRequest<unknown>(`/accounts/${accountId}/facebook-page`);
      const root = asRecord(raw) ?? {};
      const pages = Array.isArray(root.pages) ? root.pages : [];
      return pages
        .map((p) => {
          const r = asRecord(p);
          if (!r) return null;
          return {
            id: pickString(r, 'id') ?? '',
            name: pickString(r, 'name') ?? '',
            category: pickString(r, 'category') ?? '',
            fanCount: pickNum(r, 'fan_count'),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.id !== '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn('[zernio] FB pages:', msg);
      return [];
    }
  }

  /** GET /v1/usage-stats — current plan + limits (profiles used vs limit). */
  async getUsageStats(): Promise<{
    planName: string;
    billingPeriod: string;
    limits: { uploads: number; profiles: number };
    usage: { uploads: number; profiles: number; lastReset: string | null };
    hasAccess: boolean;
  } | null> {
    try {
      const raw = await zernioRequest<unknown>(`/usage-stats`);
      const root = asRecord(raw);
      if (!root) return null;
      const limits = asRecord(root.limits) ?? {};
      const usage = asRecord(root.usage) ?? {};
      return {
        planName: pickString(root, 'planName') ?? 'unknown',
        billingPeriod: pickString(root, 'billingPeriod') ?? 'unknown',
        limits: { uploads: pickNum(limits, 'uploads'), profiles: pickNum(limits, 'profiles') },
        usage: {
          uploads: pickNum(usage, 'uploads'),
          profiles: pickNum(usage, 'profiles'),
          lastReset: pickString(usage, 'lastReset') ?? null,
        },
        hasAccess: root.hasAccess === true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) console.warn('[zernio] usage-stats:', msg);
      return null;
    }
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
