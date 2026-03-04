// Posting service abstraction — swap providers by changing POSTING_PROVIDER env var

export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

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
  getMediaUploadUrl(contentType?: string): Promise<{ uploadUrl: string; publicUrl: string }>;

  /** List posts from Late */
  listPosts(query?: ListPostsQuery): Promise<LatePost[]>;

  /** Get analytics for an account */
  getAnalytics(query: AnalyticsQuery): Promise<PostAnalytics[]>;

  /** Retry a failed post */
  retryPost(externalPostId: string): Promise<PublishResult>;
}
