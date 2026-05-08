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
  | 'team_assigned'
  | 'ops_handoff'
  | 'poc_invite';

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

/**
 * Brand basics is the only screen that bidirectionally syncs to the
 * `clients` row — these fields mirror columns on `clients` so the
 * strategist sees the latest in both places. The submit handler
 * persists to both step_state (for audit) and `clients` (for live data).
 */
export interface BrandBasicsState {
  tagline?: string;
  what_we_sell?: string;
  audience?: string;
  voice?: string;
  current_offers?: string;
  /** Captured by `triggered_by` field once a POC submits. */
  submitted_by_email?: string;
}

export interface SocialPlatformConnection {
  /** Tri-state: client connected via OAuth, asked us to set it up, or skipped. */
  status: 'pending' | 'connected' | 'manual' | 'skipped' | 'set_up_for_me';
  handle?: string;
  connected_at?: string;
  zernio_account_id?: string;
}

export interface SocialHandlesState {
  /** Per-platform tri-state map. Key = platform slug or "meta_business_suite". */
  connections?: Record<string, SocialPlatformConnection>;
  /** Self-attested ack for the Meta Business Suite tile. */
  meta_business_suite_acknowledged?: boolean;
}

export interface PointOfContactEntry {
  /** Mirrored from public.contacts row id when synced. Undefined for inline-added rows. */
  contact_id?: string;
  name: string;
  email: string;
  role?: string;
  is_primary: boolean;
}

export interface PointsOfContactState {
  contacts: PointOfContactEntry[];
}

/**
 * Editing footage screen. Three optional URL buckets + free-text notes.
 * URLs are stored one-per-line, trimmed, no validation server-side beyond
 * length cap. The post-production team eyeballs the links.
 */
export interface FootageAndReferencesState {
  raw_footage_urls?: string[];
  reference_edit_urls?: string[];
  previous_edit_urls?: string[];
  notes?: string;
}

/** Full step_state union, kind-discriminated. */
export interface SmmStepState {
  brand_basics?: BrandBasicsState;
  social_handles?: SocialHandlesState;
  points_of_contact?: PointsOfContactState;
}

export interface EditingStepState {
  brand_basics?: BrandBasicsState;
  footage_and_references?: FootageAndReferencesState;
}

export type StepStateFor<K extends OnboardingKind> =
  K extends 'smm' ? SmmStepState :
  K extends 'editing' ? EditingStepState :
  never;
