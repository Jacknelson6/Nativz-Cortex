// Types for the topic search / ideation MVP flow

export interface TopicSearch {
  id: string;
  query: string;
  source: string;
  time_range: string;
  language: string;
  country: string;
  client_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  summary: string | null;
  metrics: SearchMetrics | null;
  activity_data: ActivityDataPoint[] | null;
  emotions: EmotionBreakdown[] | null;
  content_breakdown: ContentBreakdown | null;
  trending_topics: TrendingTopic[] | null;
  raw_ai_response: TopicSearchAIResponse | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  approved_at: string | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// AI response — single call returns everything
export interface TopicSearchAIResponse {
  summary: string;
  metrics: SearchMetrics;
  activity_data: ActivityDataPoint[];
  emotions: EmotionBreakdown[];
  content_breakdown: ContentBreakdown;
  trending_topics: TrendingTopic[];
}

export interface SearchMetrics {
  total_engagements: number;
  engagement_rate: number;
  estimated_views: number;
  estimated_reach: number;
  total_mentions: number;
}

export interface ActivityDataPoint {
  date: string;
  views: number;
  mentions: number;
  sentiment: number;
}

export interface EmotionBreakdown {
  emotion: string;
  percentage: number;
  color: string;
}

export interface ContentBreakdown {
  intentions: ContentBreakdownItem[];
  categories: ContentBreakdownItem[];
  formats: ContentBreakdownItem[];
}

export interface ContentBreakdownItem {
  name: string;
  percentage: number;
  engagement_rate: number;
}

export interface TrendingTopic {
  name: string;
  estimated_views: number;
  resonance: 'low' | 'medium' | 'high' | 'viral';
  sentiment: number;
  date: string;
  posts_overview: string;
  comments_overview: string;
  video_ideas: VideoIdea[];
}

export interface VideoIdea {
  title: string;
  hook: string;
  format: string;
  virality: 'low' | 'medium' | 'high' | 'viral_potential';
  why_it_works: string;
}

// Filter options for the search form
export const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'twitter', label: 'X (Twitter)' },
] as const;

export const TIME_RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_year', label: 'Last year' },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'all', label: 'All languages' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
] as const;

export const COUNTRY_OPTIONS = [
  { value: 'all', label: 'All countries' },
  { value: 'us', label: 'United States' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'br', label: 'Brazil' },
] as const;
