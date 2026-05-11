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
  overrides: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const LIFECYCLE_LABELS: Record<ProspectLifecycleState, string> = {
  discovered: 'Discovered',
  audited: 'Audited',
  in_outreach: 'In outreach',
  demo_scheduled: 'Demo scheduled',
  converted: 'Converted',
  lost: 'Lost',
};
