import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { sendEditingDeliverableEmail } from '@/lib/email/resend';
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import { archiveEditingShareLinkEmail } from '@/lib/content-tools/archive-editing-share-email';
import { createEditingShareLink } from '@/lib/editing/share-link';

/**
 * Mux-webhook-driven auto-deliver: when every video on an editing project
 * reaches `mux_status='ready'`, mint a share link, email the brand POCs,
 * stamp the linked monthly_deliverable_slot as delivered, and archive the
 * email body so the modal's Past emails section can replay it.
 *
 * Idempotent on share_link presence: callers MUST verify the project does
 * not already have an active (non-archived) share link before invoking,
 * otherwise admins who manually mint + send before processing finishes
 * would get a duplicate auto-send.
 */

type AutoDeliverResult =
  | { skipped: 'no_videos' | 'no_recipients' | 'project_not_found' | 'send_failed'; detail?: string }
  | { delivered: true; shareUrl: string; recipientCount: number };

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

export async function autoDeliverEditingProject(
  admin: SupabaseClient,
  projectId: string,
): Promise<AutoDeliverResult> {
  type ProjectRow = {
    id: string;
    name: string | null;
    client_id: string;
    month_slot_id: string | null;
    clients: { id: string; name: string; agency: string | null } | null;
  };
  const { data: project } = await admin
    .from('editing_projects')
    .select('id, name, client_id, month_slot_id, clients(id, name, agency)')
    .eq('id', projectId)
    .single<ProjectRow>();
  if (!project) return { skipped: 'project_not_found' };

  // Pick "video / static / mixed" the same way the manual email route does
  // (image/* mime → static, anything else → video). Drives copy in the email.
  const { data: assetRows } = await admin
    .from('editing_project_videos')
    .select('mime_type')
    .eq('project_id', projectId);
  let hasImage = false;
  let hasVideo = false;
  for (const r of assetRows ?? []) {
    const m = (r as { mime_type: string | null }).mime_type ?? '';
    if (m.startsWith('image/')) hasImage = true;
    else hasVideo = true;
  }
  const contentKind: 'video' | 'static' | 'mixed' =
    hasImage && !hasVideo ? 'static' : hasImage && hasVideo ? 'mixed' : 'video';

  const clientId = project.clients?.id ?? project.client_id;
  const clientName = project.clients?.name ?? 'your brand';
  const projectName = project.name?.trim() || clientName;
  const agency = getBrandFromAgency(project.clients?.agency ?? null);

  const eligible = await getClientNotificationRecipients(admin, clientId);
  if (eligible.length === 0) {
    return { skipped: 'no_recipients' };
  }

  const created = await createEditingShareLink(admin, projectId, null);
  if ('error' in created) {
    return { skipped: created.error === 'no_videos' ? 'no_videos' : 'send_failed', detail: created.error };
  }
  const { link } = created;

  const recipients = eligible.map((c) => c.email);
  const pocFirstNames = eligible.map((c) => firstName(c.name));

  const result = await sendEditingDeliverableEmail({
    to: recipients,
    pocFirstNames,
    clientName,
    projectName,
    shareUrl: link.url,
    agency,
    clientId,
    projectId,
    contentKind,
  });

  if (!result.ok) {
    return { skipped: 'send_failed', detail: result.error ?? 'email_send_failed' };
  }

  const sentAt = new Date().toISOString();

  // Stamp the bookmark so a subsequent revision upload triggers re-review,
  // not another delivery email.
  await admin
    .from('editing_project_share_links')
    .update({ last_review_email_sent_at: sentAt })
    .eq('id', link.id);

  // Archive the rendered HTML so the modal's Past emails section can replay
  // it. Best-effort; failure is logged but doesn't roll back.
  await archiveEditingShareLinkEmail(admin, {
    shareLinkId: link.id,
    kind: 'delivery',
    subject: `Your ${projectName} cuts are ready for review`,
    htmlBody: result.html,
    recipients: eligible.map((c) => ({ email: c.email, name: c.name })),
    sentBy: null,
  });

  // Flip the linked monthly slot to delivered if there is one. Ad-hoc
  // projects (no month_slot_id) are skipped silently.
  if (project.month_slot_id) {
    await admin
      .from('monthly_deliverable_slots')
      .update({ status: 'delivered', delivered_at: sentAt })
      .eq('id', project.month_slot_id);
  }

  return { delivered: true, shareUrl: link.url, recipientCount: recipients.length };
}
