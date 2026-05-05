import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Writer for the `share_link_emails` table (migration 241). The unified
 * review modal needs to surface "what was actually said" for every email
 * that touched a share link. The existing `email_messages` log records
 * every Resend send across the platform; this table is keyed by
 * `share_link_id` so the modal can ask one indexed question and get
 * back the touchpoint history.
 *
 * Best-effort: a failed insert here MUST NOT roll back the send. The send
 * already happened; an archive miss just means the modal won't show the
 * preview body for that one row. We log and move on.
 */

export type ShareLinkEmailKind =
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

export async function archiveShareLinkEmail(
  admin: SupabaseClient,
  args: {
    shareLinkId: string;
    kind: ShareLinkEmailKind;
    subject: string;
    htmlBody: string;
    plainBody?: string | null;
    recipients: ArchivedRecipient[];
    sentBy: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('share_link_emails').insert({
    share_link_id: args.shareLinkId,
    kind: args.kind,
    subject: args.subject,
    html_body: args.htmlBody,
    plain_body: args.plainBody ?? null,
    recipients: args.recipients,
    sent_by: args.sentBy,
  });
  if (error) {
    console.warn('[archive-share-email] insert failed:', {
      shareLinkId: args.shareLinkId,
      kind: args.kind,
      error: error.message,
    });
  }
}
