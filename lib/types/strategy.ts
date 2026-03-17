// Types for the client onboard strategy and shoot planning features

// ---------------------------------------------------------------------------
// Content strategy (onboard wizard)
// ---------------------------------------------------------------------------

export interface AudienceAnalysis {
  demographics: string;
  psychographics: string;
  online_behavior: string;
  pain_points: string[];
  aspirations: string[];
}

export interface ContentPillarStrategy {
  pillar: string;
  description: string;
  example_series: string[];
  frequency: string;
  formats: string[];
  hooks: string[];
}

export interface PlatformRecommendation {
  platform: string;
  priority: 'primary' | 'secondary' | 'experimental';
  posting_cadence: string;
  content_types: string[];
  rationale: string;
}

export interface TrendingOpportunity {
  trend: string;
  relevance: string;
  urgency: 'act_now' | 'this_week' | 'this_month' | 'ongoing';
  content_angle: string;
  source_url?: string;
}

export interface VideoIdeaStrategy {
  title: string;
  hook: string;
  format: string;
  platform: string;
  estimated_virality: 'low' | 'medium' | 'high' | 'viral_potential';
  why_it_works: string;
  pillar: string;
}

export interface CompetitiveLandscape {
  competitor: string;
  strengths: string;
  weaknesses: string;
  gap_opportunity: string;
}

export interface NextStep {
  action: string;
  timeline: string;
  priority: 'high' | 'medium' | 'low';
  category: 'content' | 'platform' | 'branding' | 'research';
}

export interface ContentStrategy {
  executive_summary: string;
  audience_analysis: AudienceAnalysis;
  content_pillars: ContentPillarStrategy[];
  platform_strategy: PlatformRecommendation[];
  trending_opportunities: TrendingOpportunity[];
  video_ideas: VideoIdeaStrategy[];
  competitive_landscape: CompetitiveLandscape[];
  next_steps: NextStep[];
}

export interface ClientStrategy {
  id: string;
  client_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  executive_summary: string | null;
  audience_analysis: AudienceAnalysis | null;
  content_pillars: ContentPillarStrategy[] | null;
  platform_strategy: PlatformRecommendation[] | null;
  trending_opportunities: TrendingOpportunity[] | null;
  video_ideas: VideoIdeaStrategy[] | null;
  competitive_landscape: CompetitiveLandscape[] | null;
  next_steps: NextStep[] | null;
  raw_ai_response: ContentStrategy | null;
  serp_data: unknown | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Onboard wizard state
// ---------------------------------------------------------------------------

export interface OnboardFormData {
  name: string;
  website_url: string;
  industry: string;
  target_audience: string;
  brand_voice: string;
  topic_keywords: string[];
  logo_url: string | null;
  poc_name: string;
  poc_email: string;
  services: string[];
  agency: string;
}

export type OnboardStep = 'input' | 'analyze' | 'provision' | 'strategy' | 'review';

export interface ProvisionResult {
  cortex: { success: boolean; clientId?: string; error?: string };
  vault: { success: boolean; error?: string };
  monday: { success: boolean; error?: string };
}

// ---------------------------------------------------------------------------
// Shoot planner
// ---------------------------------------------------------------------------

export interface CalendarConnection {
  id: string;
  user_id: string;
  provider: 'google';
  calendar_id: string;
  connected_at: string;
  last_synced_at: string | null;
}

export interface ShootEvent {
  id: string;
  calendar_connection_id: string | null;
  google_event_id: string | null;
  client_id: string | null;
  title: string;
  shoot_date: string;
  location: string | null;
  notes: string | null;
  plan_status: 'pending' | 'generating' | 'sent' | 'skipped';
  plan_generated_at: string | null;
  plan_sent_at: string | null;
  plan_sent_to: string[] | null;
  created_at: string;
  // Joined fields
  client_name?: string;
}

export interface ContentLog {
  id: string;
  client_id: string;
  shoot_event_id: string | null;
  title: string;
  content_type: string | null;
  platform: string | null;
  published_at: string | null;
  performance_notes: string | null;
  vault_path: string | null;
  created_at: string;
}

export interface ShootPlan {
  overview: string;
  client_context: string;
  trending_angles: ShootPlanAngle[];
  shot_list: ShotItem[];
  content_calendar: ContentCalendarItem[];
  logistics_notes: string[];
  past_performance_insights: string;
}

export interface ShootPlanAngle {
  topic: string;
  angle: string;
  why_now: string;
  format: string;
  estimated_virality: 'low' | 'medium' | 'high' | 'viral_potential';
}

export interface ShotItem {
  title: string;
  description: string;
  format: string;
  platform: string;
  hook: string;
  b_roll_notes: string;
  priority: 'must_have' | 'nice_to_have' | 'bonus';
}

export interface ContentCalendarItem {
  day: string;
  content_title: string;
  platform: string;
  format: string;
  notes: string;
}
