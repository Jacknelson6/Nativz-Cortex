// Posting service abstraction — default provider is Zernio (POSTING_PROVIDER=zernio or late alias)

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'googlebusiness';

export interface SocialProfile {
  id: string;
  platform: SocialPlatform;
  platformUserId: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  /**
   * Zernio profile id this account hangs under. Stored on our side as
   * `clients.late_profile_id`. Matching by `(profileId, platform)` lets
   * the connections matrix link a Zernio account to a Cortex brand
   * without depending on username string compares (which break when
   * Zernio normalizes handles with underscores etc). May be null when
   * Zernio omits the field (older accounts); callers should treat null
   * as "unknown attachment" and skip reconciliation.
   */
  profileId?: string | null;
}

export type PublishMediaItem = {
  type: 'video' | 'image';
  url: string;
};

export interface PublishPostInput {
  /** Public URL to the video file. Optional when mediaItems is provided (image / carousel posts). */
  videoUrl?: string;
  /** Ordered media items for carousel / multi-image posts. When present, takes precedence over videoUrl. */
  mediaItems?: PublishMediaItem[];
  /** Caption / description text */
  caption: string;
  /** Hashtags to append (without # prefix) */
  hashtags: string[];
  /** Public URL to the cover/thumbnail image */
  coverImageUrl?: string;
  /** @handles to tag */
  taggedPeople?: string[];
  /** @handles for collaborators (Instagram) */
  collaboratorHandles?: string[];
  /** Platform account IDs to post to */
  platformProfileIds: string[];
  /** Map of profileId -> platform for building platform-specific config */
  platformHints?: Record<string, SocialPlatform>;
  /** Optional per-platform caption overrides. Falls back to `caption` when a platform key is missing or empty. */
  captionByPlatform?: Partial<Record<SocialPlatform, string>>;
  /** Schedule for later (ISO 8601) or omit to publish immediately */
  scheduledAt?: string;

  // ----- Per-platform overrides (added 2026-05-01) -----
  // These map to columns on `scheduled_posts` (migration 218). NULL/undefined
  // means "use the existing default" from buildPublishBody, so existing
  // call-sites stay valid without changes.

  /** YouTube video title (max 100 chars). Falls back to caption's first line. */
  youtubeTitle?: string;
  /** YouTube description. Falls back to the shared caption. */
  youtubeDescription?: string;
  /** YouTube tags (without # prefix). Falls back to shared hashtags. */
  youtubeTags?: string[];
  /** YouTube privacy. Defaults to 'public'. */
  youtubePrivacy?: 'public' | 'unlisted' | 'private';
  /** YouTube made-for-kids flag (COPPA). Defaults to false. */
  youtubeMadeForKids?: boolean;

  /** TikTok comments allowed. Defaults to true. */
  tiktokAllowComment?: boolean;
  /** TikTok duets allowed. Defaults to true. */
  tiktokAllowDuet?: boolean;
  /** TikTok stitches allowed. Defaults to true. */
  tiktokAllowStitch?: boolean;

  /** Cross-post Instagram Reel to feed. Defaults to true. */
  instagramShareToFeed?: boolean;

  // ----- Per-platform routing overrides (added 2026-05-06) -----
  // Each per-platform router auto-detects content variant from media items
  // by default. These overrides force a specific variant (e.g. publish a
  // 9:16 image as an IG Story instead of the default feed routing).

  /** Instagram content variant. Default: image-only → feed/carousel; video → reels. */
  instagramContentType?: 'feed' | 'reels' | 'story';

  /** Facebook content variant. Default: no discriminator (Zernio routes feed-image / feed-video). */
  facebookContentType?: 'feed' | 'reel' | 'story';
  /** Facebook target page when the connected account manages multiple pages. */
  facebookPageId?: string;

  /** LinkedIn document title (REQUIRED by LinkedIn for PDF / PPT / DOCX posts). */
  linkedinDocumentTitle?: string;
  /** LinkedIn organization URN to post as a company page. Format: `urn:li:organization:123456`. */
  linkedinOrganizationUrn?: string;
  /** LinkedIn: suppress the auto URL preview card on text-only posts that contain a link. */
  linkedinDisableLinkPreview?: boolean;

  /**
   * Auto-posted as the first comment after publish. Supported by Facebook,
   * Instagram (feed/carousel only — IG suppresses on Stories), LinkedIn, and
   * YouTube. Useful for parking external links out of the caption (LinkedIn
   * down-ranks link posts ~40-50%).
   */
  firstComment?: string;
}

export interface PublishResult {
  /** Provider's internal post ID */
  externalPostId: string;
  /** Per-platform results */
  platforms: PlatformResult[];
}

export interface PlatformResult {
  platform: SocialPlatform;
  profileId: string;
  status: 'published' | 'scheduled' | 'failed';
  externalPostId?: string;
  externalPostUrl?: string;
  error?: string;
  // Structured Zernio error envelope preserved alongside the composed
  // `error` string. Consumers (e.g. publish cron's account-disconnect
  // classifier) prefer branching on `errorCode` over regex-matching `error`.
  errorCode?: string;
  errorType?: string;
  errorMessage?: string;
}

export interface PostStatusResult {
  externalPostId: string;
  platforms: PlatformResult[];
}

export interface ConnectProfileInput {
  platform: SocialPlatform;
  /** Redirect URL after OAuth completion */
  callbackUrl: string;
  /** Zernio profile id (stored as clients.late_profile_id) */
  profileId: string;
}

export interface ConnectProfileResult {
  /** URL to redirect user to for OAuth */
  authorizationUrl: string;
}

export interface PostAnalytics {
  impressions: number;
  engagement: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  platform: SocialPlatform;
  date: string;
}

export interface AnalyticsQuery {
  accountId: string;
  startDate: string;
  endDate: string;
}

export interface ListPostsQuery {
  platform?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface LatePost {
  id: string;
  content: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  platforms: Array<{
    platform: string;
    accountId: string;
    status: string;
    platformPostUrl?: string;
    error?: string;
  }>;
  mediaItems?: Array<{ url: string; type: string }>;
  createdAt: string;
}

// --- Late analytics types ---

export interface DailyMetricsQuery {
  accountId: string;
  startDate: string;
  endDate: string;
  // Optional but strongly recommended per Zernio canon: without `platform`,
  // the daily-metrics endpoint can return cross-platform aggregate rows
  // rather than per-platform per-account rows. Callers should pass the
  // SocialPlatform they're syncing.
  platform?: SocialPlatform;
}

export interface DailyMetric {
  date: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  engagement: number;
  engagementRate: number;
  postsCount: number;
}

export interface FollowerStats {
  followers: number;
  followerChange: number;
  /** Growth as a percentage of starting followers (e.g. 4.17 for +4.17%). */
  growthPercent: number;
  /** Daily follower counts in the window (may be empty when unsupported). */
  series: Array<{ date: string; followers: number }>;
}

export interface InstagramInsights {
  /** Daily profile-link-tap counts. */
  profileVisits: Array<{ date: string; value: number }>;
  /** Daily reach counts (Instagram is the only platform with reach as time series). */
  reachSeries: Array<{ date: string; value: number }>;
}

export interface PostAnalyticsItem {
  postId: string;
  /** Native platform post id (YouTube videoId, TikTok videoId, IG media id, etc.).
   * Needed to drill into platform-specific endpoints like YT daily-views. */
  platformPostId: string | null;
  platform: SocialPlatform;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postType: string | null;
  publishedAt: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
}

export interface PostAnalyticsQuery {
  accountId: string;
  startDate: string;
  endDate: string;
}

// --- Late unified analytics response ---

export interface LateAnalyticsPost {
  _id: string;
  content: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  status: string;
  platform: string;
  platformPostUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  profileId: string | null;
  isExternal: boolean;
  analytics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    views: number;
    engagementRate: number;
    lastUpdated: string | null;
  } | null;
  platforms: Array<{
    platform: string;
    status: string;
    platformPostId: string | null;
    accountId: string;
    accountUsername: string;
    analytics: {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      views: number;
      engagementRate: number;
    } | null;
  }>;
  mediaItems?: Array<{ type: string; url: string; thumbnail?: string }>;
}

export interface LateAnalyticsAccount {
  _id: string;
  platform: string;
  username: string;
  followersCount: number;
}

export interface LateAnalyticsResponse {
  overview: {
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    lastSync: string | null;
  };
  posts: LateAnalyticsPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  accounts: LateAnalyticsAccount[];
  hasAnalyticsAccess: boolean;
}

export interface PostingService {
  /** Publish or schedule a post across platforms */
  publishPost(input: PublishPostInput): Promise<PublishResult>;

  /** Check the status of a previously published post */
  getPostStatus(externalPostId: string): Promise<PostStatusResult>;

  /** Delete a post from the provider (and platforms if already published) */
  deletePost(externalPostId: string): Promise<void>;

  /**
   * Reschedule an already-queued (not yet published) post to a new time.
   * Throws if the provider rejects (e.g. post already published, invalid
   * timestamp, network error). Callers should treat failures as a warning,
   * not as a reason to roll back local DB state — our `scheduled_at` is the
   * authoritative source of truth and the cron will pick it up regardless.
   */
  reschedulePost(externalPostId: string, scheduledFor: string): Promise<void>;

  /** Start OAuth flow to connect a social profile */
  connectProfile(input: ConnectProfileInput): Promise<ConnectProfileResult>;

  /** Disconnect a social profile */
  disconnectProfile(profileId: string): Promise<void>;

  /** List all connected profiles */
  getConnectedProfiles(): Promise<SocialProfile[]>;

  /** Get a presigned upload URL for media */
  getMediaUploadUrl(contentType?: string, filename?: string): Promise<{ uploadUrl: string; publicUrl: string }>;

  /** List posts from the provider (Zernio) */
  listPosts(query?: ListPostsQuery): Promise<LatePost[]>;

  /** Get analytics for an account */
  getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]>;

  /** Retry a failed post */
  retryPost(externalPostId: string): Promise<PublishResult>;

  /** Get daily aggregate metrics for an account */
  getDailyMetrics(query: DailyMetricsQuery): Promise<DailyMetric[]>;

  /** Get follower stats for an account over a date range */
  getFollowerStats(accountId: string, startDate?: string, endDate?: string): Promise<FollowerStats>;

  /** Get per-post analytics for an account */
  getPostAnalytics(query: PostAnalyticsQuery): Promise<PostAnalyticsItem[]>;
}
