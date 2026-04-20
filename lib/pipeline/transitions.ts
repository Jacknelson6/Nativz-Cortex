/**
 * Stage transition matrix for the content pipeline — one source of truth used
 * by both the `/api/pipeline/[id]/advance` smart advance route and the raw
 * PATCH route, so drag-drop on the board and the quick-action buttons can't
 * silently corrupt state by jumping past intermediate stages.
 */

export type PipelineTrack = 'assignment' | 'raws' | 'editing' | 'client_approval' | 'boosting';

export const TRACK_FIELD: Record<PipelineTrack, string> = {
  assignment: 'assignment_status',
  raws: 'raws_status',
  editing: 'editing_status',
  client_approval: 'client_approval_status',
  boosting: 'boosting_status',
};

export const FIELD_TRACK: Record<string, PipelineTrack> = Object.fromEntries(
  Object.entries(TRACK_FIELD).map(([k, v]) => [v, k as PipelineTrack]),
);

export const TRANSITIONS: Record<PipelineTrack, Record<string, string[]>> = {
  assignment: {
    can_assign: ['assigned'],
    assigned: ['need_shoot', 'can_assign'],
    need_shoot: ['can_assign', 'assigned'],
  },
  raws: {
    need_to_schedule: ['waiting_on_shoot'],
    waiting_on_shoot: ['uploaded'],
    uploaded: ['waiting_on_shoot'],
  },
  editing: {
    not_started: ['editing'],
    editing: ['edited', 'blocked'],
    edited: ['em_approved', 'revising'],
    em_approved: ['scheduled', 'revising', 'done'],
    revising: ['edited', 'blocked'],
    blocked: ['editing', 'not_started'],
    scheduled: ['done'],
    done: ['revising', 'scheduled'],
  },
  client_approval: {
    not_sent: ['waiting_on_approval'],
    waiting_on_approval: ['client_approved', 'needs_revision'],
    client_approved: ['sent_to_paid_media', 'needs_revision'],
    needs_revision: ['revised'],
    revised: ['waiting_on_approval'],
    sent_to_paid_media: ['client_approved'],
  },
  boosting: {
    not_boosting: ['working_on_it'],
    working_on_it: ['done'],
    done: ['working_on_it'],
  },
};

export interface PipelineItemSnapshot {
  assignment_status: string;
  raws_status: string;
  editing_status: string;
  client_approval_status: string;
  boosting_status: string;
}

/**
 * Default stall thresholds (days) per track. Used by the summary endpoint
 * to mark items as "stalled" so they surface as a dedicated bucket.
 * Exported so both the summary API and any admin UI can use the same
 * numbers without drifting.
 */
export const STALL_DAYS: Record<string, number> = {
  assignment_status: 1,
  raws_status: 7,
  editing_status: 3,
  client_approval_status: 2,
  boosting_status: 3,
};

/** Merge a per-field stamp into the jsonb blob stored on content_pipeline. */
export function stampStageChange(
  current: Record<string, unknown> | null | undefined,
  field: string,
  at: Date = new Date(),
): Record<string, unknown> {
  return { ...(current ?? {}), [field]: at.toISOString() };
}

/** Read the last-change timestamp for a field, falling back to `updated_at`. */
export function getStageChangedAt(
  stageChangedAt: Record<string, unknown> | null | undefined,
  field: string,
  updatedAt: string | null | undefined,
): Date | null {
  const raw = stageChangedAt?.[field];
  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (updatedAt) {
    const d = new Date(updatedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** True when the item has been on the given status for longer than the stall threshold. */
export function isStalled(
  field: string,
  stageChangedAt: Record<string, unknown> | null | undefined,
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const lastChange = getStageChangedAt(stageChangedAt, field, updatedAt);
  if (!lastChange) return false;
  const days = (now.getTime() - lastChange.getTime()) / (24 * 60 * 60 * 1000);
  return days >= (STALL_DAYS[field] ?? 3);
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a single-track transition against the matrix + any cross-track
 * guardrails (e.g. can't start editing before raws are uploaded).
 */
export function validateTransition(
  track: PipelineTrack,
  from: string,
  to: string,
  item: PipelineItemSnapshot,
): TransitionCheck {
  if (from === to) return { ok: true };

  const allowed = TRANSITIONS[track]?.[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason:
        `Cannot move ${track} from "${from}" to "${to}". ` +
        `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}.`,
    };
  }

  // Cross-track guard: kicking off editing requires raws to be uploaded first.
  // Prevents editors burning cycles on incomplete footage — the pipeline
  // summary already flags this as the #1 bottleneck, so treat it as a hard
  // rule, not a soft warning.
  if (track === 'editing' && to === 'editing' && item.raws_status !== 'uploaded') {
    return {
      ok: false,
      reason: 'Cannot start editing before raws are uploaded.',
    };
  }

  return { ok: true };
}
