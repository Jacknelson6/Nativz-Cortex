export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'googlebusiness';

// Meta-style presets. Legacy values (`7d`, `30d`, `mtd`, `ytd`,
// `last_quarter`) are kept so old URL state and saved reports still resolve;
// the picker UI only surfaces the canonical set.
export type DateRangePreset =
  | 'yesterday'
  | 'last_7d'
  | 'last_28d'
  | 'last_30d'
  | 'last_90d'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_week'
  | 'last_month'
  | 'custom'
  | '7d'          // legacy → last_7d
  | '30d'         // legacy → last_30d
  | 'mtd'         // legacy → this_month
  | 'ytd'         // legacy → this_year
  | 'last_quarter';

export type ComparePreset = 'previous_period' | 'previous_year' | 'custom';

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
  /** IG only, populated on the end-of-window snapshot: gross follow events. */
  new_follows_count: number | null;
  unfollows_count: number | null;
  /** IG only, end-of-window: account-wide window totals matching MBS. */
  account_views_count: number | null;
  account_engagement_count: number | null;
  account_reach_count: number | null;
  account_profile_visits_count: number | null;
  accounts_engaged_count: number | null;
  window_days: number | null;
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
  /** Raw prior-period total; lets the UI suppress misleading deltas when
   *  the baseline was zero (change chip would otherwise read as +100% or
   *  worse from a 0 → N jump on a 2-day-old account). */
  previousTotal: number;
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
  /** Gross follow events in the window (IG only today — MBS-style). */
  newFollows?: number;
  /** Unfollow events in the window (IG only). */
  unfollows?: number;
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
    watchTime?: MetricCard;
  };
  /** YouTube-only: total seconds watched across all videos in the window. */
  watchTimeSeconds?: number;
  /** YouTube-only: view-weighted mean watch duration (seconds). */
  avgViewDurationSeconds?: number;
  /** Posts that published in the window (for the thumbnail overlay). */
  posts?: TimelinePost[];
}

export interface ChartDataPoint {
  date: string;
  views: number;
  engagement: number;
  followers: number;
}

export interface PlatformBreakdownRow {
  platform: SocialPlatform;
  username: string;
  followers: number;
  /** Net change in follower count over the window (follows − unfollows).
   * Kept for platforms where we can't get a gross number. */
  followerChange: number;
  /** Gross follow events in the window (matches Meta Business Suite's
   * "Follows" card). IG only today — falls back to `followerChange` on
   * platforms where Zernio doesn't expose it. */
  newFollows?: number;
  /** Unfollow events in the window. IG only. */
  unfollows?: number;
  views: number;
  engagement: number;
  engagementRate: number;
  postsCount: number;
  /** Total video watch time in the window, in seconds. YouTube only — Zernio
   * doesn't surface this for TikTok/IG/FB. Rendered as minutes in the UI. */
  watchTimeSeconds?: number;
  /** View-weighted average watch duration in seconds. YouTube only. */
  avgViewDurationSeconds?: number;
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
  /** Per-platform cumulative follower count per day (for multi-line chart). */
  followerChart?: Array<Record<string, string | number>>;
  /** Compact one-row-per-platform table data (Zernio-dashboard style). */
  platformBreakdown?: PlatformBreakdownRow[];
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

