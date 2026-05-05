import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Writer for `editing_share_link_emails` (migration 243). The editing
 * counterpart to archive-share-email.ts (which writes the SMM table).
 * Two tables instead of a polymorphic FK so deletes cascade cleanly
 * from each share-link table without a polymorphic check constraint.
 *
 * Best-effort: a failed insert here MUST NOT roll back the send. The
 * send already happened; an archive miss just means the editing modal
 * won't show the preview body for that one row.
 */

export type EditingShareLinkEmailKind =
  | 'delivery'
  | 'rereview'
  | 'initial'
  | 'resend'
  | 'manual_followup'
  | 'auto_followup_open'
  | 'auto_followup_action'
  | 'auto_followup_final'
  | 'all_approved'
  | 'revisions_complete';

export interface ArchivedRecipient {
  email: string;
  name?: string | null;
}

export async function archiveEditingShareLinkEmail(
  admin: SupabaseClient,
  args: {
    shareLinkId: string;
    kind: EditingShareLinkEmailKind;
    subject: string;
    htmlBody: string;
    plainBody?: string | null;
    recipients: ArchivedRecipient[];
    sentBy: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('editing_share_link_emails').insert({
    share_link_id: args.shareLinkId,
    kind: args.kind,
    subject: args.subject,
    html_body: args.htmlBody,
    plain_body: args.plainBody ?? null,
    recipients: args.recipients,
    sent_by: args.sentBy,
  });
  if (error) {
    console.warn('[archive-editing-share-email] insert failed:', {
      shareLinkId: args.shareLinkId,
      kind: args.kind,
      error: error.message,
    });
  }
}
