// Types for the topic search / ideation MVP flow

import type { BraveSerpData } from '@/lib/brave/types';

// Source citation attached to a trending topic
export interface TopicSource {
  url: string;
  title: string;
  type: 'web' | 'discussion' | 'video';
  relevance: string;
}

// NEW metrics shape — derived from real SERP data, not AI fabrication
export interface SearchMetrics {
  web_results_found: number;
  discussions_found: number;
  videos_found: number;
  total_sources: number;
  total_video_views: number | null;
  total_discussion_replies: number | null;
  overall_sentiment: number;
  conversation_intensity: 'low' | 'moderate' | 'high' | 'very_high';
}

// Legacy metrics shape for backward compatibility with old searches
export interface LegacySearchMetrics {
  total_engagements: number;
  engagement_rate: number;
  estimated_views: number;
  estimated_reach: number;
  total_mentions: number;
}

// Type guard: new metrics vs legacy
export function isNewMetrics(m: SearchMetrics | LegacySearchMetrics): m is SearchMetrics {
  return 'web_results_found' in m;
}

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
  metrics: SearchMetrics | LegacySearchMetrics | null;
  activity_data: ActivityDataPoint[] | null; // legacy, kept for old searches
  emotions: EmotionBreakdown[] | null;
  content_breakdown: ContentBreakdown | null;
  trending_topics: (TrendingTopic | LegacyTrendingTopic)[] | null;
  serp_data: BraveSerpData | null;
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
  overall_sentiment: number;
  conversation_intensity: 'low' | 'moderate' | 'high' | 'very_high';
  emotions: EmotionBreakdown[];
  content_breakdown: ContentBreakdown;
  trending_topics: TrendingTopic[];
}

// Legacy AI response for old searches
export interface LegacyTopicSearchAIResponse {
  summary: string;
  metrics: LegacySearchMetrics;
  activity_data: ActivityDataPoint[];
  emotions: EmotionBreakdown[];
  content_breakdown: ContentBreakdown;
  trending_topics: LegacyTrendingTopic[];
}

// Kept for backward compat with old data
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
  resonance: 'low' | 'medium' | 'high' | 'viral';
  sentiment: number;
  posts_overview: string;
  comments_overview: string;
  sources: TopicSource[];
  video_ideas: VideoIdea[];
}

// Legacy trending topic for old searches
export interface LegacyTrendingTopic {
  name: string;
  estimated_views: number;
  resonance: 'low' | 'medium' | 'high' | 'viral';
  sentiment: number;
  date: string;
  posts_overview: string;
  comments_overview: string;
  video_ideas: VideoIdea[];
}

// Type guard: new trending topic vs legacy
export function hasSources(topic: TrendingTopic | LegacyTrendingTopic): topic is TrendingTopic {
  return 'sources' in topic && Array.isArray((topic as TrendingTopic).sources);
}

// Type guard: check if search has serp_data
export function hasSerp(search: TopicSearch): boolean {
  return search.serp_data !== null && search.serp_data !== undefined;
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
