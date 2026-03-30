/** Shared types for video scrapers (TikTok, YouTube, Instagram) */

export type VideoPlatform = 'tiktok' | 'youtube' | 'instagram';

/** Raw scraped video from any platform */
export interface ScrapedVideo {
  platform: VideoPlatform;
  platform_id: string;
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  description: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  author_username: string;
  author_display_name: string | null;
  author_avatar: string | null;
  author_followers: number;
  hashtags: string[];
  duration_seconds: number | null;
  publish_date: string | null;
}

/** Scraped video with computed outlier score */
export interface ScoredVideo extends ScrapedVideo {
  outlier_score: number;
  hook_text: string | null;
}

/** Aggregated hook pattern from video analysis */
export interface HookPattern {
  pattern: string;
  video_count: number;
  avg_views: number;
  avg_outlier_score: number;
  example_video_ids: string[];
}

/** DB row shape for topic_search_videos */
export interface TopicSearchVideoRow {
  id: string;
  search_id: string;
  platform: VideoPlatform;
  platform_id: string;
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  description: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar: string | null;
  author_followers: number;
  outlier_score: number | null;
  hook_text: string | null;
  hashtags: string[];
  duration_seconds: number | null;
  publish_date: string | null;
  scraped_at: string;
}

/** DB row shape for topic_search_hooks */
export interface TopicSearchHookRow {
  id: string;
  search_id: string;
  pattern: string;
  video_count: number;
  avg_views: number;
  avg_outlier_score: number;
  example_video_ids: string[];
  created_at: string;
}

/** Options for scraping */
export interface ScrapeOptions {
  query: string;
  /** Multiple targeted search queries (topic + keyword combos) */
  searchQueries?: string[];
  maxResults?: number;
  timeRange?: string;
  /** ISO 639-1 language code for filtering (e.g. 'en') */
  language?: string;
}

/** Result from a single platform scrape */
export interface ScrapeResult {
  platform: VideoPlatform;
  videos: ScrapedVideo[];
  error?: string;
}
