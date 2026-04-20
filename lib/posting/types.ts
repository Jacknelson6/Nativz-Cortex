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
}

export interface PublishPostInput {
  /** Public URL to the video file */
  videoUrl: string;
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
  /** Per-platform caption override */
  customCaption?: string;
  /** Schedule for later (ISO 8601) or omit to publish immediately */
  scheduledAt?: string;
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
