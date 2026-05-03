/**
 * Shared onboarding types. Lives separate from screens.ts so server
 * routes, admin pages, and the public stepper can import the same
 * shape without dragging in the screen array.
 */

import type { OnboardingKind } from './screens';

export type OnboardingStatus = 'in_progress' | 'completed' | 'paused' | 'abandoned';

export type TeamRole =
  | 'account_manager'
  | 'strategist'
  | 'smm'
  | 'editor'
  | 'videographer'
  | 'poc';

export type EmailLogKind =
  | 'welcome'
  | 'step_reminder'
  | 'lagging_nudge'
  | 'complete'
  | 'manual'
  | 'team_assigned';

/** Row shape for `public.onboardings`. */
export interface OnboardingRow {
  id: string;
  client_id: string;
  kind: OnboardingKind;
  platforms: string[];
  current_step: number;
  share_token: string;
  step_state: Record<string, unknown>;
  status: OnboardingStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape for `public.client_team_assignments`. */
export interface TeamAssignmentRow {
  id: string;
  client_id: string;
  team_member_id: string;
  role: TeamRole;
  is_primary: boolean;
  created_at: string;
}

/** Row shape for `public.onboarding_emails_log`. */
export interface EmailLogRow {
  id: string;
  onboarding_id: string;
  kind: EmailLogKind;
  to_email: string;
  subject: string;
  body_preview: string | null;
  resend_id: string | null;
  ok: boolean;
  error: string | null;
  triggered_by: string | null;
  sent_at: string;
}

/** Per-screen step_state shapes. The stepper UI reads/writes these. */

export interface BrandBasicsState {
  brand_name?: string;
  tagline?: string;
  one_liner?: string;
  audience_snapshot?: string;
  /** Captured by `triggered_by` field once a POC submits. */
  submitted_by_email?: string;
}

export interface SocialHandlesState {
  /** Per-platform connection map. Key = platform slug (tiktok, instagram, ...). */
  connections?: Record<
    string,
    {
      handle?: string;
      connected_at?: string;
      zernio_account_id?: string;
      status: 'pending' | 'connected' | 'manual';
    }
  >;
}

export interface ContentPrefsState {
  cadence?: 'daily' | '3x_week' | '2x_week' | 'weekly';
  pillars?: string[];
  dos?: string[];
  donts?: string[];
}

export interface AudienceToneState {
  persona?: string;
  tone_descriptors?: string[];
  /** Free-form long-form context. */
  notes?: string;
}

export interface KickoffPickState {
  picked_at?: string;
  scheduling_event_id?: string;
}

export interface ProjectBriefState {
  project_name?: string;
  description?: string;
  deliverables?: Array<{ kind: string; quantity?: number; notes?: string }>;
  references?: string[];
}

export interface AssetLinkState {
  /** Primary cloud-storage URL for raw footage. */
  url?: string;
  provider?: 'google_drive' | 'dropbox' | 'wetransfer' | 'frame_io' | 'other';
  uploaded_by_email?: string;
}

export interface TurnaroundAckState {
  acknowledged: boolean;
  acknowledged_at?: string;
}

/** Full step_state union, kind-discriminated. */
export interface SmmStepState {
  brand_basics?: BrandBasicsState;
  social_handles?: SocialHandlesState;
  content_prefs?: ContentPrefsState;
  audience_tone?: AudienceToneState;
  kickoff_pick?: KickoffPickState;
}

export interface EditingStepState {
  project_brief?: ProjectBriefState;
  asset_link?: AssetLinkState;
  turnaround_ack?: TurnaroundAckState;
}

export type StepStateFor<K extends OnboardingKind> =
  K extends 'smm' ? SmmStepState :
  K extends 'editing' ? EditingStepState :
  never;
