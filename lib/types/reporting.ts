export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export type DateRangePreset = '7d' | '30d' | 'mtd' | 'ytd' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

export interface PlatformSnapshot {
  id: string;
  social_profile_id: string;
  client_id: string;
  platform: SocialPlatform;
  snapshot_date: string;
  followers_count: number;
  followers_change: number;
  views_count: number;
  engagement_count: number;
  engagement_rate: number | null;
  posts_count: number;
  created_at: string;
}

export interface PostMetric {
  id: string;
  social_profile_id: string;
  client_id: string;
  platform: SocialPlatform;
  external_post_id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  post_type: string | null;
  published_at: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  reach_count: number;
  engagement_rate: number | null;
  fetched_at: string;
}

export interface PlatformSummary {
  platform: SocialPlatform;
  username: string;
  avatarUrl: string | null;
  followers: number;
  followerChange: number;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
  postsCount: number;
}

export interface SummaryReport {
  combined: {
    totalViews: number;
    totalViewsChange: number;
    totalFollowerChange: number;
    totalFollowerChangeChange: number;
    totalEngagement: number;
    totalEngagementChange: number;
    avgEngagementRate: number;
    avgEngagementRateChange: number;
  };
  platforms: PlatformSummary[];
  dateRange: DateRange;
}

export interface TopPostItem {
  rank: number;
  id: string;
  platform: SocialPlatform;
  username: string;
  externalPostId: string;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postType: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalEngagement: number;
}

export interface NormalizedInsights {
  followers: number;
  followersChange: number;
  views: number;
  engagement: number;
  engagementRate: number;
  postsCount: number;
}

export interface NormalizedPost {
  externalPostId: string;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postType: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
}

export interface PlatformNormalizer {
  platform: SocialPlatform;
  fetchInsights(connectionId: string, dateRange: DateRange): Promise<NormalizedInsights>;
  fetchPosts(connectionId: string, dateRange: DateRange): Promise<NormalizedPost[]>;
}
