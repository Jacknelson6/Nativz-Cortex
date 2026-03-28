// Types for the topic search / ideation MVP flow

import type { SerpData } from '@/lib/serp/types';

export type SearchMode = 'general' | 'client_strategy';

// ── v2 Multi-platform types ────────────────────────────────────────────────

export type SearchPlatform = 'reddit' | 'youtube' | 'tiktok' | 'web' | 'quora';
export type SearchVolume = 'light' | 'medium' | 'deep' | 'quick'; // 'quick' kept for backward compat

export const PLATFORM_OPTIONS: { value: SearchPlatform; label: string; available: boolean }[] = [
  { value: 'web', label: 'Web', available: true },
  { value: 'reddit', label: 'Reddit', available: true },
  { value: 'youtube', label: 'YouTube', available: true },
  { value: 'tiktok', label: 'TikTok', available: true },
  { value: 'quora', label: 'Quora', available: true },
];

export interface PlatformSource {
  platform: SearchPlatform;
  id: string;
  url: string;
  title: string;
  content: string;
  author: string;
  subreddit?: string;
  /** Cover / thumbnail URL when available (video platforms) */
  thumbnailUrl?: string | null;
  /** Short-form vertical vs long-form landscape (drives thumbnail aspect in UI) */
  videoFormat?: 'short' | 'long';
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    score?: number;
  };
  createdAt: string;
  comments: PlatformComment[];
  transcript?: string | null;
}

export interface PlatformComment {
  id: string;
  text: string;
  author: string;
  likes: number;
  createdAt: string;
}

export interface PlatformBreakdown {
  platform: SearchPlatform;
  post_count: number;
  comment_count: number;
  avg_sentiment: number;
  top_subreddits?: string[];
  top_channels?: string[];
  top_hashtags?: string[];
}

export interface ConversationTheme {
  theme: string;
  post_count: number;
  sentiment: number;
  platforms: SearchPlatform[];
  representative_quotes: string[];
}

// Source citation attached to a trending topic
export interface TopicSource {
  url: string;
  title: string;
  type: 'web' | 'discussion' | 'video';
  relevance: string;
  platform?: SearchPlatform;
}

// NEW metrics shape — derived from SERP data + AI analysis
export interface SearchMetrics {
  // Source counts (kept for data, no longer displayed prominently)
  web_results_found: number;
  discussions_found: number;
  videos_found: number;
  total_sources: number;
  total_video_views: number | null;
  total_discussion_replies: number | null;
  // AI-derived display metrics
  overall_sentiment: number;
  conversation_intensity: 'low' | 'moderate' | 'high' | 'very_high';
  topic_score: number;             // 0–100, derived from topic count × resonance
  content_opportunities: number;   // total video ideas across all topics
  trending_topics_count: number;   // count of trending topics
  sources_analyzed: number;        // total sources analyzed (always > 0)
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

/** Backend pipeline: legacy (SearXNG + platform scrape) vs LLM tool research (v3). */
export type TopicPipeline = 'legacy' | 'llm_v1';

/** Tool-backed source row for llm_v1 (stored in research_sources jsonb). */
export interface ResearchSourceRecord {
  url: string;
  title: string;
  snippet?: string;
  subtopic_index: number;
  fetched_text?: string;
  platform?: SearchPlatform;
}

export interface TopicSearch {
  id: string;
  query: string;
  source: string;
  time_range: string;
  language: string;
  country: string;
  client_id: string | null;
  status: 'pending' | 'pending_subtopics' | 'processing' | 'completed' | 'failed';
  summary: string | null;
  metrics: SearchMetrics | LegacySearchMetrics | null;
  activity_data: ActivityDataPoint[] | null; // legacy, kept for old searches
  emotions: EmotionBreakdown[] | null;
  content_breakdown: ContentBreakdown | null;
  trending_topics: (TrendingTopic | LegacyTrendingTopic)[] | null;
  serp_data: SerpData | null;
  raw_ai_response: TopicSearchAIResponse | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  approved_at: string | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  /** Set while POST /process holds the single-flight lease; cleared when done. */
  processing_started_at?: string | null;
  // v2 fields
  platforms?: SearchPlatform[];
  search_version?: number;
  platform_data?: Record<string, PlatformSource[]>;
  volume?: SearchVolume;
  /** legacy | llm_v1 */
  topic_pipeline?: TopicPipeline;
  /** Confirmed subtopics (1–5) for llm_v1 */
  subtopics?: string[] | null;
  /** Deduped sources from tool calls */
  research_sources?: ResearchSourceRecord[] | null;
  pipeline_state?: Record<string, unknown> | null;
}

// Content pillar for client strategy mode
export interface ContentPillar {
  pillar: string;
  description: string;
  example_series: string;
  frequency: string;
}

// Niche performance insights for client strategy mode
export interface NicheInsights {
  top_performing_formats: string[];
  best_posting_times: string;
  audience_hooks: string[];
  competitor_gaps: string;
}

// Big movers — who's making noise in the space
export interface BigMover {
  name: string;
  type: 'brand' | 'creator' | 'product' | 'company';
  url: string | null;
  why: string;
  tactics: string[];
  takeaway: string;
}

/** Big Five (OCEAN) scores as 0–100 for synthetic audience modelling */
export interface OceanScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

/** One inferred audience segment for messaging / ICP-style planning (not empirical survey data) */
export interface SyntheticAudienceSegment {
  /** Short persona-style label, e.g. "Calm & inquisitive" */
  name: string;
  emoji: string;
  /** Approximate share of conversational attention (0–100) */
  share_percent: number;
  ocean: OceanScores;
  /** 2–4 sentences: motivations, behaviors, how they show up in the topic (ICP narrative) */
  description?: string;
  /** Topic or interest tags for messaging angles */
  interest_tags?: string[];
  /** One sentence grounded in research signals (optional if description is present) */
  rationale?: string;
}

/** Synthetic audience + OCEAN breakdown derived from topic research (modelled personas) */
export interface SyntheticAudiences {
  intro?: string;
  segments: SyntheticAudienceSegment[];
}

// AI response — single call returns everything
export interface TopicSearchAIResponse {
  summary: string;
  overall_sentiment: number;
  conversation_intensity: 'low' | 'moderate' | 'high' | 'very_high';
  emotions: EmotionBreakdown[];
  content_breakdown: ContentBreakdown;
  trending_topics: TrendingTopic[];
  big_movers?: BigMover[];
  content_pillars?: ContentPillar[];
  niche_performance_insights?: NicheInsights;
  brand_alignment_notes?: string;
  // v2 additions
  platform_breakdown?: PlatformBreakdown[];
  conversation_themes?: ConversationTheme[];
  /** Modelled segments + OCEAN — populated by narrative pipeline when present */
  synthetic_audiences?: SyntheticAudiences;
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
  /** Blended engagement from matched sources (views/likes/comments signals), set by process pipeline */
  total_engagement?: number;
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
  /** LLM may omit */
  format?: string;
  /** LLM may omit */
  virality?: 'low' | 'medium' | 'high' | 'viral_potential';
  why_it_works: string;
  /** 3-5 bullet script outline / talking points */
  script_outline?: string[];
  /** Suggested call-to-action */
  cta?: string;
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

/** Human label for `topic_searches.time_range` (e.g. "Last 3 months"). */
export function getTimeRangeOptionLabel(value: string): string {
  const o = TIME_RANGE_OPTIONS.find((x) => x.value === value);
  return o?.label ?? value.replace(/_/g, ' ');
}

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
