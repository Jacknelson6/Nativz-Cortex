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

export function unifiedStatusForShareLink(input: {
  status: ReviewLinkStatus;
  first_sent_at: string | null;
}): UnifiedStatus {
  if (!input.first_sent_at) return 'ready_to_send';
  switch (input.status) {
    case 'approved':
      return 'approved';
    case 'revising':
      return 'revising';
    case 'ready_for_review':
    case 'abandoned':
    case 'expired':
      return 'needs_approval';
  }
}
