export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: 'agency' | 'client';
  logo_url: string | null;
  primary_color: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'viewer';
  organization_id: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login: string | null;
}

export interface ClientPreferences {
  tone_keywords: string[];
  topics_lean_into: string[];
  topics_avoid: string[];
  competitor_accounts: string[];
  seasonal_priorities: string[];
}

export interface Client {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  industry: string;
  category: string | null;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[];
  social_sources: string[];
  preferences: ClientPreferences | null;
  meta_page_id: string | null;
  instagram_business_id: string | null;
  meta_access_token_encrypted: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface IdeaSubmission {
  id: string;
  client_id: string;
  submitted_by: string;
  title: string;
  description: string | null;
  source_url: string | null;
  category: 'trending' | 'content_idea' | 'request' | 'trending_topic' | 'other';
  status: 'new' | 'reviewed' | 'accepted' | 'archived';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  client_id: string;
  name: string;
  meta_page_id: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface ListeningReport {
  id: string;
  client_id: string;
  title: string;
  report_type: 'manual' | 'scheduled' | 'alert';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  research_query: string;
  search_focus: string[];
  date_range_start: string | null;
  date_range_end: string | null;
  executive_summary: string | null;
  raw_ai_response: ReportAIResponse | null;
  pain_points: PainPoint[] | null;
  trending_questions: TrendingQuestion[] | null;
  language_dictionary: LanguageDictionary | null;
  emotional_resonance_map: EmotionMapping[] | null;
  competitive_gaps: CompetitiveGap[] | null;
  content_opportunities: ContentOpportunity[] | null;
  overall_sentiment_score: number | null;
  sentiment_breakdown: SentimentBreakdown | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface SentimentSnapshot {
  id: string;
  client_id: string;
  report_id: string | null;
  snapshot_date: string;
  overall_score: number | null;
  positive_pct: number | null;
  neutral_pct: number | null;
  negative_pct: number | null;
  emotions: Record<string, number> | null;
  top_themes: string[] | null;
  top_pain_points: string[] | null;
  created_at: string;
}

export interface MetaPageSnapshot {
  id: string;
  client_id: string;
  entity_type: 'client' | 'competitor';
  competitor_id: string | null;
  snapshot_date: string;
  platform: 'facebook' | 'instagram';
  followers_count: number | null;
  followers_change: number | null;
  posts_count_period: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_shares: number | null;
  avg_engagement_rate: number | null;
  estimated_reach: number | null;
  top_posts: MetaTopPost[] | null;
  created_at: string;
}

export interface MetaPost {
  id: string;
  client_id: string;
  entity_type: 'client' | 'competitor';
  competitor_id: string | null;
  platform: string;
  post_id: string;
  post_url: string | null;
  post_type: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number | null;
  engagement_rate: number | null;
  estimated_reach: number | null;
  content_category: string | null;
  detected_themes: string[] | null;
  fetched_at: string;
}

export interface ContentIdea {
  id: string;
  client_id: string;
  report_id: string | null;
  title: string;
  description: string;
  target_emotion: string;
  suggested_format: string;
  source_insight: string;
  source_quote: string | null;
  content_type: string | null;
  estimated_virality: 'low' | 'medium' | 'high' | 'viral_potential' | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'idea' | 'approved' | 'in_production' | 'published' | 'archived';
  assigned_to: string | null;
  scheduled_date: string | null;
  content_pillar: string | null;
  client_visible_notes: string | null;
  internal_notes: string | null;
  calendar_status: 'backlog' | 'scheduled' | 'in_production' | 'published';
  source: 'ai' | 'client' | 'team';
  client_reaction: 'approved' | 'starred' | 'revision_requested' | null;
  client_feedback: string | null;
  urgency: 'normal' | 'timely' | 'urgent';
  reference_urls: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ConceptComment {
  id: string;
  content_idea_id: string;
  user_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_user_id: string;
  organization_id: string;
  type: 'report_published' | 'concepts_ready' | 'idea_submitted' | 'feedback_received' | 'preferences_updated' | 'weekly_digest';
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  email_sent: boolean;
  email_sent_at: string | null;
  created_at: string;
}

export interface SearchSchedule {
  id: string;
  organization_id: string;
  search_type: 'brand_intel' | 'topic_research' | 'both';
  frequency: 'weekly' | 'biweekly' | 'monthly';
  day_of_week: number | null;
  time_utc: string;
  additional_keywords: string[] | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

// AI Response sub-types

export interface PainPoint {
  name: string;
  frequency: string;
  severity: string;
  description: string;
  example_quotes?: string[];
}

export interface TrendingQuestion {
  question: string;
  frequency: string;
  emotion: string;
  hook_potential: string;
  source?: string;
}

export interface LanguageDictionary {
  problem: string[];
  desire: string[];
  objection: string[];
}

export interface EmotionMapping {
  topic: string;
  emotions: Record<string, number>;
}

export interface CompetitiveGap {
  competitor: string;
  gap: string;
  opportunity: string;
  severity: string;
}

export interface ContentOpportunity {
  topic: string;
  format: string;
  emotion: string;
  rationale: string;
  priority: string;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface MetaTopPost {
  post_id: string;
  type: string;
  engagement: number;
  url: string;
  thumbnail?: string;
}

export interface ReportAIResponse {
  executive_summary: string;
  overall_sentiment: {
    score: number;
    positive_pct: number;
    neutral_pct: number;
    negative_pct: number;
  };
  pain_points: PainPoint[];
  trending_questions: TrendingQuestion[];
  language_dictionary: LanguageDictionary;
  emotional_resonance_map: EmotionMapping[];
  competitive_gaps: CompetitiveGap[];
  content_opportunities: ContentOpportunity[];
}
