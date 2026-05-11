// SPY-01 prospect domain types. Mirrors migration 277_prospects.sql.

export type ProspectLifecycleState =
  | 'discovered'
  | 'audited'
  | 'in_outreach'
  | 'demo_scheduled'
  | 'converted'
  | 'lost';

export type ProspectSource =
  | 'manual'
  | 'from_brand_audit'
  | 'from_prospect_audit'
  | 'imported';

export type ProspectPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook';

export type ProspectTouchpointKind =
  | 'note'
  | 'email_sent'
  | 'email_received'
  | 'meeting'
  | 'demo'
  | 'loom'
  | 'dm'
  | 'phone'
  | 'state_change';

export interface ProspectRow {
  id: string;
  brand_name: string;
  website_url: string | null;
  primary_platform: ProspectPlatform | null;
  primary_handle: string | null;
  niche: string | null;
  notes: string | null;
  lifecycle_state: ProspectLifecycleState;
  source: ProspectSource;
  source_ref_id: string | null;
  owner_user_id: string | null;
  archived_at: string | null;
  last_touched_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectSocialRow {
  id: string;
  prospect_id: string;
  platform: ProspectPlatform;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  created_at: string;
}

export interface ProspectTouchpointRow {
  id: string;
  prospect_id: string;
  kind: ProspectTouchpointKind;
  body: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export const LIFECYCLE_STATES: ProspectLifecycleState[] = [
  'discovered',
  'audited',
  'in_outreach',
  'demo_scheduled',
  'converted',
  'lost',
];

// ── SPY-03: prospect_analyses ────────────────────────────────────────────────

export type ProspectAnalysisStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed';

export type AssessmentRating = 'good' | 'okay' | 'weak';

export interface ProfilePicAssessment {
  rating: AssessmentRating;
  note: string;
  image_url: string | null;
}

export interface BioAssessment {
  hook: string | null;
  cta: string | null;
  rating: AssessmentRating;
  note: string;
}

export interface CaptionPattern {
  hook_quality_avg: number;
  cta_rate: number;
  voice_note: string;
}

export interface CommentSignal {
  sentiment_score: number;
  recurring_themes: string[];
  reply_rate: number;
  note?: string;
}

export type CadenceTrend = 'climbing' | 'flat' | 'declining' | 'unknown';

export interface PostingCadence {
  posts_per_week: number;
  trend: CadenceTrend;
  note?: string;
}

export interface ProspectAnalysisRow {
  id: string;
  prospect_id: string;
  run_id: string;
  platform: ProspectPlatform;
  handle: string;
  status: ProspectAnalysisStatus;
  error_message: string | null;
  duration_ms: number | null;
  cost_cents: number | null;
  raw_profile: Record<string, unknown>;
  raw_captions: unknown[];
  raw_comments: unknown[];
  profile_pic_assessment: ProfilePicAssessment | null;
  bio_assessment: BioAssessment | null;
  caption_pattern: CaptionPattern | null;
  comment_signal: CommentSignal | null;
  posting_cadence: PostingCadence | null;
  observations: string[] | null;
  biggest_opportunity: string | null;
  /** SPY-09: optional LLM-drafted 30-day plan, mutable by strategist. */
  thirty_day_plan: ThirtyDayPlan | null;
  overrides: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── SPY-05: prospect_competitor_benchmarks ───────────────────────────────────

export type ProspectBenchmarkStatus =
  | 'pending'
  | 'discovering'
  | 'scraping'
  | 'grading'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type CompetitorPickSource = 'discovered' | 'manual';

export interface PickedCompetitor {
  platform: ProspectPlatform;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  source: CompetitorPickSource;
  rationale: string | null;
}

export interface CompetitorScorecard {
  platform: ProspectPlatform;
  handle: string;
  display_name: string | null;
  status: 'succeeded' | 'partial' | 'failed';
  scorecard: import('./checklist').ScorecardSnapshot | null;
  error: string | null;
  raw_inputs?: {
    bio: string | null;
    captions: string[];
    followers: number | null;
  };
}

export interface BenchmarkDeltas {
  behind: import('./checklist').ChecklistItemId[];
  ahead: import('./checklist').ChecklistItemId[];
  tied: import('./checklist').ChecklistItemId[];
}

export interface ProspectCompetitorBenchmarkRow {
  id: string;
  prospect_id: string;
  analysis_id: string | null;
  status: ProspectBenchmarkStatus;
  error_message: string | null;
  duration_ms: number | null;
  cost_cents: number | null;
  cancelled_at: string | null;
  picked_competitors: PickedCompetitor[];
  competitors: CompetitorScorecard[];
  deltas: BenchmarkDeltas;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── SPY-06: prospect_monitor_* ───────────────────────────────────────────────

export type MonitorFrequency = 'weekly' | 'biweekly';

export type AlertKind =
  | 'follower_jump'
  | 'viral_post'
  | 'cadence_shift'
  | 'format_pivot';

export type AlertSeverity = 'low' | 'medium' | 'high';

export interface ProspectMonitorConfigRow {
  id: string;
  prospect_id: string;
  frequency: MonitorFrequency;
  day_of_week: number; // 0=Sun
  active: boolean;
  paused_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorSnapshotMetrics {
  followers_count: number | null;
  posts_last_7d: number | null;
  top_post: {
    id: string | null;
    views: number | null;
    published_at: string | null;
    archetype?: string | null;
  } | null;
  archetypes_last_5?: Array<string | null>;
  median_views_last_10?: number | null;
}

export interface ProspectMonitorSnapshotRow {
  id: string;
  prospect_id: string;
  captured_at: string;
  competitor_handle: string;
  competitor_platform: ProspectPlatform;
  raw_metrics: MonitorSnapshotMetrics;
  workflow_run_id: string | null;
  created_at: string;
}

export interface ProspectMonitorAlertRow {
  id: string;
  prospect_id: string;
  snapshot_id: string | null;
  prior_snapshot_id: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  evidence: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  occurred_at: string;
}

// ── SPY-09: Sales call presentation mode ─────────────────────────────────────

export interface ThirtyDayPlanItem {
  id: string; // stable id, e.g. action_01
  title: string; // <= 80 chars
  body: string; // <= 240 chars
  rationale: string; // why this matters, <= 200 chars
}

export interface ThirtyDayPlan {
  generated_at: string;
  items: ThirtyDayPlanItem[]; // exactly 3
  strategist_edited: boolean;
}

export interface PresentationCover {
  brand_name: string;
  brand_logo_url: string | null;
  prepared_for_date: string;
}

export interface PresentationVsCompetitors {
  prospectScore: number;
  competitorScores: Array<{ handle: string; score: number }>;
}

export interface PresentationContact {
  sales_rep_name: string;
  sales_rep_email: string;
}

export interface PresentationSnapshot {
  cover: PresentationCover;
  current_state: import('./checklist').ScorecardSnapshot;
  vs_competitors: PresentationVsCompetitors | null;
  biggest_opportunity: { title: string; body: string };
  thirty_day_plan: ThirtyDayPlan;
  contact: PresentationContact;
}

export const LIFECYCLE_LABELS: Record<ProspectLifecycleState, string> = {
  discovered: 'Discovered',
  audited: 'Audited',
  in_outreach: 'In outreach',
  demo_scheduled: 'Demo scheduled',
  converted: 'Converted',
  lost: 'Lost',
};
