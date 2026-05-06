/**
 * Unified review-modal status — the 4-state contract that both
 * row types in the content-tools surface map down to.
 *
 *   ready_to_send   nothing has been shared with the client yet
 *   needs_approval  share link is live, waiting on the client's verdict
 *   revising        client requested changes; admin is iterating
 *   approved        every deliverable in the bundle is approved
 *
 * Source data:
 *   - SMM share link: `ReviewLinkStatus` from `review-board.tsx`
 *     (`abandoned | expired | approved | revising | ready_for_review`)
 *     plus `first_sent_at` to disambiguate "made the link, never sent it".
 *   - Editing project: `EditingProjectStatus` from `lib/editing/types`
 *     (`editing | need_approval | revising | approved | done | archived`).
 *
 * `archived` is excluded upstream from the board, so it's mapped to
 * `approved` here as a terminal best-fit rather than throwing.
 *
 * `abandoned` / `expired` for SMM links don't have a clean home in the
 * 4-state. The table renders a grey/stale pill on top of the unified
 * pill in those cases; the unified status remains whatever the bundle
 * looked like at the point it stalled (i.e. `needs_approval`).
 */

import type { EditingProjectStatus } from '@/lib/editing/types';
import type { ReviewLinkStatus } from '@/components/scheduler/review-board';

export type UnifiedStatus =
  | 'ready_to_send'
  | 'needs_approval'
  | 'revising'
  | 'approved';

export const UNIFIED_STATUS_LABEL: Record<UnifiedStatus, string> = {
  ready_to_send: 'Ready to send',
  needs_approval: 'Needs approval',
  revising: 'Revising',
  approved: 'Approved',
};

export function unifiedStatusForEditingProject(
  status: EditingProjectStatus,
): UnifiedStatus {
  switch (status) {
    case 'editing':
      return 'ready_to_send';
    case 'need_approval':
      return 'needs_approval';
    case 'revising':
      return 'revising';
    case 'approved':
    case 'done':
    case 'archived':
      return 'approved';
  }
}

/**
 * Map a calendar share-link's raw state to one of the 4 unified buckets.
 *
 * Approval and revision state always win over send-state — once every
 * post in the bundle is approved, the pill must read "Approved" even if
 * the admin never clicked Send (e.g. they ran the whole flow inside the
 * dialog or marked posts approved manually). Same for "Revising": the
 * moment a comment lands, that's what the pill reflects.
 *
 * Send-state only matters for the unsent / sent-and-waiting split:
 *
 *   - all approved              → 'approved'
 *   - any revising              → 'revising'
 *   - never sent (no email out) → 'ready_to_send'
 *   - sent, not all approved    → 'needs_approval'
 *
 * Jack's state machine spec (2026-05-05):
 *   not started -> editing -> ready to send -> need approval -> revising OR approved
 *
 * `pipeline_status` (added 2026-05-06) is the admin-set override on the
 * underlying drop. When non-null it short-circuits the share-link compute
 * so the SMM modal's Status dropdown can park a row anywhere in the
 * pipeline, mirroring how the editing modal's Status dropdown works.
 */
export function unifiedStatusForShareLink(input: {
  status: ReviewLinkStatus;
  first_sent_at: string | null;
  pipeline_status?: EditingProjectStatus | null;
}): UnifiedStatus {
  if (input.pipeline_status) {
    return unifiedStatusForEditingProject(input.pipeline_status);
  }
  // Terminal states win over send-state. A 10/10 approved bundle is
  // "Approved" whether or not it was ever emailed (the previous logic
  // forced these rows to read "Ready to send" forever).
  if (input.status === 'approved') return 'approved';
  if (input.status === 'revising') return 'revising';
  if (!input.first_sent_at) return 'ready_to_send';
  return 'needs_approval';
}
