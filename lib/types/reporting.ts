export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin';

export type DateRangePreset = '7d' | '30d' | 'mtd' | 'last_month' | 'ytd' | 'custom' | 'last_quarter';

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
  reach_count: number | null;
  impressions_count: number | null;
  link_clicks_count: number | null;
  profile_visits_count: number | null;
  watch_time_seconds: number | null;
  follower_growth_percent: number | null;
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

export interface MetricSeriesPoint {
  date: string;
  value: number;
}

/** Headline number + prior-period delta % + daily sparkline for one metric. */
export interface MetricCard {
  total: number;
  changePercent: number;
  series: MetricSeriesPoint[];
}

/** One post in the window, used to render thumbnails along a sparkline. */
export interface TimelinePost {
  date: string;
  thumbnailUrl: string | null;
  postUrl: string | null;
  caption: string | null;
  views: number;
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
  /** Per-metric card data; only metrics with non-zero totals populate. */
  metrics?: {
    views?: MetricCard;
    engagement?: MetricCard;
    engagementRate?: MetricCard;
    followersGained?: MetricCard;
    reach?: MetricCard;
    impressions?: MetricCard;
    profileVisits?: MetricCard;
  };
  /** Posts that published in the window (for the thumbnail overlay). */
  posts?: TimelinePost[];
}

export interface ChartDataPoint {
  date: string;
  views: number;
  engagement: number;
  followers: number;
}

export interface SummaryReport {
  combined: {
    totalFollowers?: number;
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
  chart?: ChartDataPoint[];
  platformCharts?: Record<SocialPlatform, ChartDataPoint[]>;
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

