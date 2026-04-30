import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import {
  buildEditingDeliverableDraft,
  buildEditingRereviewDraft,
  sendEditingDeliverableEmail,
  sendEditingRereviewEmail,
} from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/editing/projects/:id/share/:linkId/email
 *   Returns the composed draft (subject + message + recipients) so the
 *   admin can preview and edit before sending.
 *
 * POST /api/admin/editing/projects/:id/share/:linkId/email
 *   Admin-only manual send. Optionally accepts `{ subject, message }`
 *   overrides from the draft dialog. Emails every POC on the project's
 *   client with `notifications_enabled` on `content_drop_review_contacts`
 *   and links to the public `/c/edit/<token>` review page.
 *
 * Mirrors the calendar followup flow but keyed on the editing share-link
 * instead of a calendar drop. Recipients live in the shared review
 * contacts table (keyed on `client_id`) so the same POC list that
 * approves calendars also approves edits.
 */

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

interface ShareLinkRow {
  id: string;
  project_id: string;
  token: string;
  expires_at: string;
  archived_at: string | null;
  last_review_email_sent_at: string | null;
}

interface VideoRevisionRow {
  id: string;
  version: number;
  created_at: string;
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

interface ReviewContactRow {
  email: string | null;
  name: string | null;
  notifications_enabled: boolean | null;
}

async function loadEmailContext(projectId: string, linkId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    } as const;
  }
  if (!(await isAdmin(user.id))) {
    return {
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    } as const;
  }

  const admin = createAdminClient();

  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('id, project_id, token, expires_at, archived_at, last_review_email_sent_at')
    .eq('id', linkId)
    .eq('project_id', projectId)
    .single<ShareLinkRow>();
  if (!link) {
    return {
      error: NextResponse.json({ error: 'link_not_found' }, { status: 404 }),
    } as const;
  }
  if (link.archived_at) {
    return {
      error: NextResponse.json({ error: 'link_revoked' }, { status: 410 }),
    } as const;
  }
  if (new Date(link.expires_at) < new Date()) {
    return {
      error: NextResponse.json({ error: 'link_expired' }, { status: 410 }),
    } as const;
  }

  const { data: project } = await admin
    .from('editing_projects')
    .select('id, name, client_id, clients(id, name, agency)')
    .eq('id', projectId)
    .single<ProjectRow>();
  if (!project) {
    return {
      error: NextResponse.json({ error: 'project_not_found' }, { status: 404 }),
    } as const;
  }

  const clientId = project.clients?.id ?? project.client_id;
  const clientName = project.clients?.name ?? 'your brand';
  const projectName = project.name?.trim() || clientName;
  const agency = getBrandFromAgency(project.clients?.agency ?? null);

  const { data: contacts } = await admin
    .from('content_drop_review_contacts')
    .select('email, name, notifications_enabled')
    .eq('client_id', clientId)
    .returns<ReviewContactRow[]>();

  const eligible = (contacts ?? []).filter(
    (c): c is { email: string; name: string | null; notifications_enabled: boolean } =>
      !!c.email && c.notifications_enabled !== false,
  );

  const appUrl = resolveAppUrl(project.clients?.agency);
  const shareUrl = `${appUrl}/c/edit/${link.token}`;

  // Compute "videos uploaded since the last send" so the dialog can switch
  // between Send delivery vs Send re-review and surface a count badge. Null
  // last_review_email_sent_at = no review email ever sent (treated as
  // delivery). Otherwise pending = videos with version > 1 created after the
  // bookmark.
  let pendingRevisionCount = 0;
  if (link.last_review_email_sent_at) {
    const { data: revs } = await admin
      .from('editing_project_videos')
      .select('id, version, created_at')
      .eq('project_id', project.id)
      .gt('version', 1)
      .gt('created_at', link.last_review_email_sent_at)
      .returns<VideoRevisionRow[]>();
    pendingRevisionCount = revs?.length ?? 0;
  }
  const kind: 'delivery' | 'rereview' = link.last_review_email_sent_at
    ? 'rereview'
    : 'delivery';

  return {
    admin,
    link,
    clientId,
    clientName,
    projectId: project.id,
    projectName,
    agency,
    eligible,
    shareUrl,
    kind,
    pendingRevisionCount,
  } as const;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await ctx.params;
  const ctxResult = await loadEmailContext(id, linkId);
  if ('error' in ctxResult) return ctxResult.error;

  const {
    eligible,
    clientName,
    projectName,
    shareUrl,
    kind,
    pendingRevisionCount,
  } = ctxResult;
  if (eligible.length === 0) {
    return NextResponse.json(
      {
        error:
          'no review contacts with notifications enabled for this brand. Add a POC under Review contacts on the brand profile.',
      },
      { status: 400 },
    );
  }

  const pocFirstNames = eligible.map((c) => firstName(c.name));
  const draft =
    kind === 'rereview'
      ? buildEditingRereviewDraft({
          pocFirstNames,
          clientName,
          projectName,
          pendingCount: pendingRevisionCount,
        })
      : buildEditingDeliverableDraft({
          pocFirstNames,
          clientName,
          projectName,
        });

  return NextResponse.json({
    subject: draft.subject,
    message: draft.message,
    recipients: eligible.map((c) => ({ email: c.email, name: c.name })),
    client_name: clientName,
    project_name: projectName,
    share_url: shareUrl,
    kind,
    pending_count: pendingRevisionCount,
  });
}

const PostBodySchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().min(1).max(5000).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await ctx.params;

  const raw = await req.json().catch(() => ({}));
  const parsed = PostBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid override payload' },
      { status: 400 },
    );
  }

  const ctxResult = await loadEmailContext(id, linkId);
  if ('error' in ctxResult) return ctxResult.error;

  const {
    admin,
    link,
    clientId,
    clientName,
    projectId,
    projectName,
    agency,
    eligible,
    shareUrl,
    kind,
    pendingRevisionCount,
  } = ctxResult;

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        error:
          'no review contacts with notifications enabled for this brand. Add a POC under Review contacts on the brand profile.',
      },
      { status: 400 },
    );
  }

  const recipients = eligible.map((c) => c.email);
  const pocFirstNames = eligible.map((c) => firstName(c.name));

  const result =
    kind === 'rereview'
      ? await sendEditingRereviewEmail({
          to: recipients,
          pocFirstNames,
          clientName,
          projectName,
          shareUrl,
          pendingCount: pendingRevisionCount,
          agency,
          clientId,
          projectId,
          subjectOverride: parsed.data.subject,
          messageOverride: parsed.data.message,
        })
      : await sendEditingDeliverableEmail({
          to: recipients,
          pocFirstNames,
          clientName,
          projectName,
          shareUrl,
          agency,
          clientId,
          projectId,
          subjectOverride: parsed.data.subject,
          messageOverride: parsed.data.message,
        });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'email send failed' },
      { status: 502 },
    );
  }

  // Stamp the bookmark so the next send computes pending revisions from this
  // moment forward and switches the dialog into "Send re-review" mode.
  const sentAt = new Date().toISOString();
  await admin
    .from('editing_project_share_links')
    .update({ last_review_email_sent_at: sentAt })
    .eq('id', link.id);

  return NextResponse.json({
    ok: true,
    kind,
    pending_count: pendingRevisionCount,
    recipients_count: recipients.length,
    sent_at: sentAt,
  });
}

function resolveAppUrl(agency: string | null | undefined): string {
  const brand = getBrandFromAgency(agency);
  return process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(brand);
}
