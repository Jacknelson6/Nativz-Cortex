/**
 * Cortex → Monday writeback for the content-calendar approval flow.
 *
 * The Monday Content Calendars board (id 9232769015) tracks each calendar's
 * `Client Approval` status across the month. Cortex is the source of truth
 * for what clients have approved/requested-changes-on; this module pushes
 * that state into Monday so the team's board stays in sync.
 *
 * State derivation (`computeApprovalLabel` below):
 *   • any open changes-requested newer than its revision marker → "Needs revision"
 *   • every post approved (and no open changes outstanding)     → "Client approved"
 *   • some posts have been revised, awaiting client re-review   → "Revised"
 *   • otherwise (link sent, nothing acted on yet)               → "Waiting on approval"
 *
 * Monday item lookup is by client name + month group. The group naming
 * convention is *creation month*: the "April 2026" group holds the May
 * 1–31 calendar (created in April, scheduled for May).
 */

import {
  mondayQuery,
  fetchContentCalendarItems,
  parseContentCalendarItem,
} from './client';
import type { createAdminClient } from '@/lib/supabase/admin';

const BOARD_ID = 9232769015;
const COL_CLIENT_APPROVAL = 'color_mksd61fs';

export const APPROVAL_CLIENT_APPROVED = 'Client approved';
export const APPROVAL_NEEDS_REVISION = 'Needs revision';
export const APPROVAL_WAITING_ON_APPROVAL = 'Waiting on approval';
export const APPROVAL_REVISED = 'Revised';

export type ApprovalLabel =
  | typeof APPROVAL_CLIENT_APPROVED
  | typeof APPROVAL_NEEDS_REVISION
  | typeof APPROVAL_REVISED
  | typeof APPROVAL_WAITING_ON_APPROVAL;

/**
 * Group title for a calendar whose first scheduled post lands on `startDate`.
 * Subtracts one calendar month — "April 2026" group holds the May calendar.
 */
export function groupTitleForCalendarStart(startDate: string): string {
  const d = new Date(startDate);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface CalendarItemMatch {
  itemId: string;
  editedVideosFolderUrl: string | null;
}

/**
 * Find the Monday Content Calendars item for a given client + month group.
 * Item names are formatted "Client Name (ABBR)" — `parseContentCalendarItem`
 * strips the parenthetical for matching.
 */
export async function findContentCalendarItem(
  clientName: string,
  groupTitle: string,
): Promise<CalendarItemMatch | null> {
  const { items } = await fetchContentCalendarItems();
  const target = clientName.toLowerCase().trim();
  for (const item of items) {
    if (item.group.title !== groupTitle) continue;
    const parsed = parseContentCalendarItem(item);
    if (parsed.clientName.toLowerCase().trim() === target) {
      return {
        itemId: item.id,
        editedVideosFolderUrl: parsed.editedVideosFolderUrl || null,
      };
    }
  }
  return null;
}

export async function setClientApprovalStatus(
  itemId: string,
  label: string,
): Promise<void> {
  // Monday status columns: column_values is a JSON string whose contents
  // are themselves a JSON object. Hence the double-stringify.
  const value = JSON.stringify(JSON.stringify({ label }));
  await mondayQuery(`
    mutation {
      change_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${COL_CLIENT_APPROVAL}",
        value: ${value}
      ) { id }
    }
  `);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Read the current approval state of a content calendar from Cortex and return
 * the Monday label that reflects it. Returns `null` when the drop has no share
 * link yet (nothing to mirror).
 */
export async function computeApprovalLabel(
  admin: AdminClient,
  dropId: string,
): Promise<ApprovalLabel | null> {
  const { data: links } = await admin
    .from('content_drop_share_links')
    .select('post_review_link_map')
    .eq('drop_id', dropId)
    .returns<{ post_review_link_map: Record<string, string> | null }[]>();

  const reviewLinkIds = new Set<string>();
  for (const link of links ?? []) {
    for (const id of Object.values(link.post_review_link_map ?? {})) {
      reviewLinkIds.add(id);
    }
  }
  if (reviewLinkIds.size === 0) return null;

  const ids = Array.from(reviewLinkIds);

  const [{ data: comments }, { data: revRows }] = await Promise.all([
    admin
      .from('post_review_comments')
      .select('review_link_id, status, created_at')
      .in('review_link_id', ids)
      .in('status', ['approved', 'changes_requested'])
      .returns<{ review_link_id: string; status: string; created_at: string }[]>(),
    admin
      .from('post_review_links')
      .select('id, revisions_completed_at')
      .in('id', ids)
      .returns<{ id: string; revisions_completed_at: string | null }[]>(),
  ]);

  // For each review link, capture the newest approval and newest changes-requested
  // comment, plus the revisions_completed_at marker.
  const newestApprovedAt = new Map<string, string>();
  const newestChangesAt = new Map<string, string>();
  for (const c of comments ?? []) {
    if (c.status === 'approved') {
      const prev = newestApprovedAt.get(c.review_link_id);
      if (!prev || c.created_at > prev) newestApprovedAt.set(c.review_link_id, c.created_at);
    } else if (c.status === 'changes_requested') {
      const prev = newestChangesAt.get(c.review_link_id);
      if (!prev || c.created_at > prev) newestChangesAt.set(c.review_link_id, c.created_at);
    }
  }
  const revisedAt = new Map<string, string | null>();
  for (const r of revRows ?? []) revisedAt.set(r.id, r.revisions_completed_at);

  let anyOpenChanges = false;
  let anyRevised = false;
  let allApproved = true;
  for (const id of ids) {
    const approvedAt = newestApprovedAt.get(id) ?? null;
    const changesAt = newestChangesAt.get(id) ?? null;
    const revAt = revisedAt.get(id) ?? null;

    // Open changes = newest changes_requested with no superseding approval
    // and no revision marker after it.
    const changesSuperseded =
      changesAt &&
      ((approvedAt && approvedAt > changesAt) || (revAt && revAt > changesAt));
    if (changesAt && !changesSuperseded) anyOpenChanges = true;

    if (revAt && (!changesAt || revAt > changesAt) && (!approvedAt || revAt > approvedAt)) {
      anyRevised = true;
    }

    const isApproved =
      approvedAt && (!changesAt || approvedAt > changesAt) && (!revAt || approvedAt > revAt);
    if (!isApproved) allApproved = false;
  }

  if (anyOpenChanges) return APPROVAL_NEEDS_REVISION;
  if (allApproved) return APPROVAL_CLIENT_APPROVED;
  if (anyRevised) return APPROVAL_REVISED;
  return APPROVAL_WAITING_ON_APPROVAL;
}

/**
 * End-to-end: derive the current label from Cortex state and push it to the
 * matching Monday item. Idempotent — flipping a column to its current value
 * is a no-op. Errors are logged, not thrown; callers wrap in `after()` so
 * Vercel keeps the function alive past the response.
 */
export async function syncMondayApprovalForDrop(
  admin: AdminClient,
  dropId: string,
): Promise<{ label: ApprovalLabel; itemId: string } | null> {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, start_date, clients(name)')
    .eq('id', dropId)
    .single<{ id: string; start_date: string; clients: { name: string } | null }>();
  if (!drop?.clients?.name) return null;

  const label = await computeApprovalLabel(admin, dropId);
  if (!label) return null;

  const groupTitle = groupTitleForCalendarStart(drop.start_date);
  const item = await findContentCalendarItem(drop.clients.name, groupTitle);
  if (!item) {
    console.warn(
      `Monday calendar item not found for ${drop.clients.name} in group "${groupTitle}"`,
    );
    return null;
  }
  await setClientApprovalStatus(item.itemId, label);
  return { label, itemId: item.itemId };
}
