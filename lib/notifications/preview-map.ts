import 'server-only';

import type { AgencyBrand } from '@/lib/agency/detect';
import type { NotificationPreviewResult } from './registry';

/**
 * Server-only preview registry — keeps email/Chat preview renderers off the
 * client bundle. The notification `registry.ts` is pure data so the per-client
 * toggle grid (`components/clients/client-notifications-grid.tsx`) can import
 * it without pulling `lib/email/resend.ts` (which transitively pulls
 * `node:crypto` and `next/server`'s `after`).
 *
 * Each value is a function so the underlying preview module is only loaded
 * when a preview is actually requested.
 */
type PreviewFn = (
  agency: AgencyBrand,
) => Promise<NotificationPreviewResult | null>;

export const NOTIFICATION_PREVIEWS: Record<string, PreviewFn> = {
  calendar_comment_digest: async (agency) => {
    const { previewCalendarCommentDigest } = await import(
      './previews/calendar-comment-digest'
    );
    return previewCalendarCommentDigest(agency);
  },
  calendar_comment_chat: async () => {
    const { previewCalendarCommentChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewCalendarCommentChat();
  },
  calendar_all_approved_chat: async () => {
    const { previewCalendarAllApprovedChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewCalendarAllApprovedChat();
  },
  calendar_followup_cadence: async (agency) => {
    const { previewCalendarCadenceFollowup } = await import(
      './previews/calendar-reminders'
    );
    return previewCalendarCadenceFollowup(agency);
  },
  calendar_auto_approve: async () => {
    const { previewCalendarAutoApproveChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewCalendarAutoApproveChat();
  },
  calendar_revisions_complete: async (agency) => {
    const { previewCalendarRevisionsComplete } = await import(
      './previews/calendar-reminders'
    );
    return previewCalendarRevisionsComplete(agency);
  },
  editing_comment_chat: async () => {
    const { previewEditingCommentChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewEditingCommentChat();
  },
  editing_all_approved_chat: async () => {
    const { previewCalendarAllApprovedChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewCalendarAllApprovedChat();
  },
  editing_followup_cadence: async (agency) => {
    const { previewEditingCadenceFollowup } = await import(
      './previews/calendar-reminders'
    );
    return previewEditingCadenceFollowup(agency);
  },
  editing_auto_approve: async () => {
    const { previewEditingAutoApproveChat } = await import(
      './previews/calendar-comment-chat'
    );
    return previewEditingAutoApproveChat();
  },
  editing_revisions_complete: async (agency) => {
    const { previewEditingRevisionsComplete } = await import(
      './previews/calendar-reminders'
    );
    return previewEditingRevisionsComplete(agency);
  },
};

export function hasPreview(key: string): boolean {
  return key in NOTIFICATION_PREVIEWS;
}

export function getPreview(key: string): PreviewFn | null {
  return NOTIFICATION_PREVIEWS[key] ?? null;
}

/**
 * Set of keys that have a preview wired up. Safe to ship to the client (just
 * strings), so the admin settings page can mark rows "previewable" without
 * pulling the renderers themselves.
 */
export const PREVIEWABLE_NOTIFICATION_KEYS: ReadonlySet<string> = new Set(
  Object.keys(NOTIFICATION_PREVIEWS),
);
