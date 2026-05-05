import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import {
  buildEditingRevisionsCompleteDraft,
  sendEditingRevisionsCompleteEmail,
} from '@/lib/email/resend';
import { getNotificationSetting } from '@/lib/notifications/get-setting';
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import { archiveEditingShareLinkEmail } from '@/lib/content-tools/archive-editing-share-email';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/share/:linkId/revisions-complete
 *
 * Admin-only. Fires the "your revisions are ready to review" email when
 * the editor has marked every outstanding revision request on this share
 * link as resolved. Mirrors the calendar pattern at
 * `/api/calendar/drops/[id]/posts/[postId]/revision/complete` but scoped
 * to the share link (editing has no per-post review-link-id breakout).
 *
 * Guardrails:
 *   - 400 if any `changes_requested` comment on this share link is still
 *     unresolved (resolve them via the public review PATCH first).
 *   - 400 if the share link never had any revisions to begin with.
 *   - 412 if `editing_revisions_complete` is disabled in admin settings.
 *
 * The resolved subject + rendered HTML are archived to
 * `editing_share_link_emails` so the unified review modal's Past emails
 * tab can replay the body.
 */

interface ShareLinkRow {
  id: string;
  project_id: string;
  token: string;
  expires_at: string;
  archived_at: string | null;
}

interface ProjectRow {
  id: string;
  name: string | null;
  client_id: string;
  clients: {
    id: string;
    name: string;
    agency: string | null;
  } | null;
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

function resolveAppUrl(agency: string | null | undefined): string {
  const brand = getBrandFromAgency(agency);
  return process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(brand);
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const setting = await getNotificationSetting('editing_revisions_complete');
  if (!setting.enabled) {
    return NextResponse.json(
      { error: 'editing_revisions_complete is disabled in notification settings' },
      { status: 412 },
    );
  }

  const admin = createAdminClient();

  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('id, project_id, token, expires_at, archived_at')
    .eq('id', linkId)
    .eq('project_id', id)
    .maybeSingle<ShareLinkRow>();
  if (!link) {
    return NextResponse.json({ error: 'link_not_found' }, { status: 404 });
  }
  if (link.archived_at) {
    return NextResponse.json({ error: 'link_revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link_expired' }, { status: 410 });
  }

  // Verify every changes_requested on this share link is resolved.
  const { data: changeRows } = await admin
    .from('editing_project_review_comments')
    .select('id, metadata')
    .eq('share_link_id', link.id)
    .eq('status', 'changes_requested')
    .returns<Array<{ id: string; metadata: Record<string, unknown> | null }>>();

  const total = changeRows?.length ?? 0;
  if (total === 0) {
    return NextResponse.json(
      { error: 'no_revision_requests' },
      { status: 400 },
    );
  }
  const unresolved = (changeRows ?? []).filter((c) => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.resolved !== true;
  }).length;
  if (unresolved > 0) {
    return NextResponse.json(
      { error: 'unresolved_revisions', unresolved },
      { status: 400 },
    );
  }

  const { data: project } = await admin
    .from('editing_projects')
    .select('id, name, client_id, clients(id, name, agency)')
    .eq('id', id)
    .maybeSingle<ProjectRow>();
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  const clientId = project.clients?.id ?? project.client_id;
  const clientName = project.clients?.name ?? 'your brand';
  const projectName = project.name?.trim() || clientName;
  const brand = getBrandFromAgency(project.clients?.agency ?? null);
  const appUrl = resolveAppUrl(project.clients?.agency);
  const shareUrl = `${appUrl}/s/${link.token}`;

  const recipients = await getClientNotificationRecipients(admin, clientId);
  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          'no contacts on the brand profile to email. Add a POC on the brand profile.',
      },
      { status: 400 },
    );
  }

  const pocFirstNames = recipients.map((c) => firstName(c.name));
  const draft = buildEditingRevisionsCompleteDraft({
    pocFirstNames,
    clientName,
    projectName,
  });

  const result = await sendEditingRevisionsCompleteEmail({
    to: recipients.map((c) => c.email),
    pocFirstNames,
    clientName,
    projectName,
    shareUrl,
    agency: brand,
    clientId,
    projectId: project.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'email send failed' },
      { status: 502 },
    );
  }

  await archiveEditingShareLinkEmail(admin, {
    shareLinkId: link.id,
    kind: 'revisions_complete',
    subject: draft.subject,
    htmlBody: result.html,
    recipients: recipients.map((c) => ({ email: c.email, name: c.name })),
    sentBy: user.id,
  });

  return NextResponse.json({
    ok: true,
    recipients_count: recipients.length,
    sent_at: new Date().toISOString(),
  });
}
