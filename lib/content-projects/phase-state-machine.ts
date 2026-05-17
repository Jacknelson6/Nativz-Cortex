/**
 * Phase state machine for the unified Content Tools project lifecycle.
 *
 * The 9-state pipeline (added in migration 322):
 *
 *   Planning -> Shoot booked -> Shoot done -> Raw uploaded
 *      -> Editing -> Client review -> Approved -> Publishing -> Done
 *
 * Transitions are forward by default; we expose `BACK_TRANSITIONS` for
 * explicit "send back to editing" / "reopen review" actions surfaced in
 * the slide-over so admins can correct mistakes without raw SQL.
 *
 * Role lenses (Videographer / Editor / PM) get a phase-aware primary
 * CTA via `nextActionFor()`. The PM lens (Jack) sees every CTA.
 */

import type { EditingProjectPhase } from '@/lib/editing/types';

export const FORWARD_TRANSITIONS: Record<EditingProjectPhase, EditingProjectPhase | null> = {
  Planning: 'Shoot booked',
  'Shoot booked': 'Shoot done',
  'Shoot done': 'Raw uploaded',
  'Raw uploaded': 'Editing',
  Editing: 'Client review',
  'Client review': 'Approved',
  Approved: 'Publishing',
  Publishing: 'Done',
  Done: null,
};

/**
 * Where each phase can go *backwards* on explicit admin action. Used
 * for "Send back to editing" (Client review -> Editing) and
 * "Reopen review" (Approved -> Client review).
 */
export const BACK_TRANSITIONS: Partial<Record<EditingProjectPhase, EditingProjectPhase[]>> = {
  'Shoot booked': ['Planning'],
  'Shoot done': ['Shoot booked'],
  'Raw uploaded': ['Shoot done'],
  Editing: ['Raw uploaded'],
  'Client review': ['Editing'],
  Approved: ['Client review'],
  Publishing: ['Approved'],
  Done: ['Publishing'],
};

export function isValidTransition(from: EditingProjectPhase, to: EditingProjectPhase): boolean {
  if (from === to) return false;
  if (FORWARD_TRANSITIONS[from] === to) return true;
  return (BACK_TRANSITIONS[from] ?? []).includes(to);
}

export type PhaseRole = 'pm' | 'videographer' | 'editor';

export interface PhaseAction {
  /** Phase this action transitions the project into. */
  toPhase: EditingProjectPhase;
  /** Label rendered on the CTA button. */
  label: string;
  /**
   * Hint used by the UI to decide button emphasis. `primary` = filled,
   * `secondary` = outlined, `tertiary` = text-only.
   */
  emphasis: 'primary' | 'secondary' | 'tertiary';
  /** Roles allowed to perform this action. PM is always implicit. */
  roles: PhaseRole[];
  /**
   * Optional preconditions the UI must satisfy before enabling the CTA.
   *  - `drive_folder_url`: a Drive folder URL must be set on the project.
   *  - `editing_videos`:   at least one cut uploaded to editing_project_videos.
   *  - `share_link`:       at least one active share link exists.
   *  - `scheduled_posts`:  at least one scheduled_post is attached.
   */
  precondition?: 'drive_folder_url' | 'editing_videos' | 'share_link' | 'scheduled_posts';
}

const NEXT_ACTION_BY_PHASE: Record<EditingProjectPhase, PhaseAction[]> = {
  Planning: [
    {
      toPhase: 'Shoot booked',
      label: 'Mark shoot booked',
      emphasis: 'primary',
      roles: ['pm', 'videographer'],
    },
  ],
  'Shoot booked': [
    {
      toPhase: 'Shoot done',
      label: 'Mark shoot complete',
      emphasis: 'primary',
      roles: ['pm', 'videographer'],
    },
  ],
  'Shoot done': [
    {
      toPhase: 'Raw uploaded',
      label: 'Raws uploaded',
      emphasis: 'primary',
      roles: ['pm', 'videographer'],
      precondition: 'drive_folder_url',
    },
  ],
  'Raw uploaded': [
    {
      toPhase: 'Editing',
      label: 'Start editing',
      emphasis: 'primary',
      roles: ['pm', 'editor'],
    },
  ],
  Editing: [
    {
      toPhase: 'Client review',
      label: 'Send to client',
      emphasis: 'primary',
      roles: ['pm', 'editor'],
      precondition: 'editing_videos',
    },
  ],
  'Client review': [
    {
      toPhase: 'Approved',
      label: 'Mark approved',
      emphasis: 'primary',
      roles: ['pm'],
    },
    {
      toPhase: 'Editing',
      label: 'Send back to editing',
      emphasis: 'secondary',
      roles: ['pm', 'editor'],
    },
  ],
  Approved: [
    {
      toPhase: 'Publishing',
      label: 'Schedule for publish',
      emphasis: 'primary',
      roles: ['pm'],
    },
    {
      toPhase: 'Client review',
      label: 'Reopen review',
      emphasis: 'tertiary',
      roles: ['pm'],
    },
  ],
  Publishing: [
    {
      toPhase: 'Done',
      label: 'Mark complete',
      emphasis: 'primary',
      roles: ['pm'],
    },
  ],
  Done: [],
};

export function nextActionsFor(
  phase: EditingProjectPhase,
  role: PhaseRole,
): PhaseAction[] {
  const all = NEXT_ACTION_BY_PHASE[phase] ?? [];
  // PM sees every CTA; other roles only see ones tagged to them.
  if (role === 'pm') return all;
  return all.filter((a) => a.roles.includes(role));
}

/**
 * Single primary CTA for a phase + role. Used by the slide-over header
 * to render a single big button. Returns null when the role has nothing
 * to do at this phase (state is owned by someone else).
 */
export function primaryActionFor(
  phase: EditingProjectPhase,
  role: PhaseRole,
): PhaseAction | null {
  const actions = nextActionsFor(phase, role);
  return actions.find((a) => a.emphasis === 'primary') ?? actions[0] ?? null;
}

/**
 * Helper: given the *current* phase + a set of project facts, return
 * whether a phase auto-advances. Used by the "Raws uploaded" button to
 * stamp `raws_uploaded_at` AND advance phase atomically.
 */
export interface PhaseAutoAdvanceInput {
  phase: EditingProjectPhase;
  hasDriveFolderUrl: boolean;
  hasEditingVideos: boolean;
  hasShareLink: boolean;
  hasScheduledPosts: boolean;
}

export function autoAdvancedPhase(input: PhaseAutoAdvanceInput): EditingProjectPhase | null {
  const { phase, hasDriveFolderUrl, hasEditingVideos, hasShareLink, hasScheduledPosts } = input;
  if (phase === 'Shoot done' && hasDriveFolderUrl) return 'Raw uploaded';
  if (phase === 'Raw uploaded' && hasEditingVideos) return 'Editing';
  if (phase === 'Editing' && hasShareLink) return 'Client review';
  if (phase === 'Approved' && hasScheduledPosts) return 'Publishing';
  return null;
}
