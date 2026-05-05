import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getNotificationSetting } from '@/lib/notifications/get-setting';

export const dynamic = 'force-dynamic';

/**
 * Public comment endpoints for the editing-project review page.
 *
 * Mirrors `/api/calendar/share/[token]/comment` but is significantly
 * smaller because editing projects have no Monday board / no Zernio
 * publish flow / no per-client chat webhooks (yet). All we need is:
 *
 *   - POST   add a comment / approve / request-changes on a video
 *            (or the project as a whole if `videoId` is omitted).
 *   - DELETE remove a comment that this share link authored.
 *   - PATCH  toggle `metadata.resolved` on a `changes_requested`
 *            row so the editor can mark a revision as handled.
 *
 * Auth model: anyone with the share token can post. We re-validate the
 * token on every call (against `expires_at` + `archived_at`) so a stale
 * client can't keep posting after revocation.
 */

const AttachmentSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().nonnegative(),
});

const BodySchema = z
  .object({
    // Optional. When omitted the comment is project-level (e.g. an
    // "approve all" stamp). Required when status === 'video_revised'
    // since that event always belongs to a specific clip.
    videoId: z.string().uuid().nullable().optional(),
    authorName: z.string().min(1).max(80),
    content: z.string().max(2000).default(''),
    // 'video_revised' is an audit-trail row written after an admin
    // replaces a clip via the public review page. We accept it from
    // the same endpoint instead of standing up a parallel "events"
    // route so the activity feed has one source.
    status: z.enum([
      'approved',
      'changes_requested',
      'comment',
      'video_revised',
    ]),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    // Frame-anchor in seconds (for change requests / plain comments).
    timestampSeconds: z.number().min(0).max(86400).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status === 'approved' ||
      v.status === 'video_revised' ||
      v.content.trim().length > 0 ||
      (v.attachments?.length ?? 0) > 0,
    {
      message: 'comment must have text or at least one attachment',
      path: ['content'],
    },
  )
  .refine((v) => v.status !== 'video_revised' || Boolean(v.videoId), {
    message: 'video_revised events must include a videoId',
    path: ['videoId'],
  });

const DeleteSchema = z.object({ commentId: z.string().uuid() });
const PatchSchema = z.object({
  commentId: z.string().uuid(),
  resolved: z.boolean(),
});

/**
 * Smart approval detection — same heuristic as the calendar route. If a
 * reviewer types "approved" or "perfect, no changes" but submits via
 * the comment / change-request form, we infer an approval rather than
 * making them re-click. Conservative on purpose; long, hedging text
 * stays a comment.
 */
function looksLikeApproval(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 80) return false;
  const APPROVAL_RE =
    /\b(approved?|approving|lgtm|sgtm|ship ?it|good to go|all good|love (this|it|them)|nothing to change|change nothing|no (changes?|edits|notes|revisions?)|leave (as is|it)|perfect|looks (good|great|amazing|perfect|fantastic)|sounds (good|great)|green ?light)\b/i;
  if (!APPROVAL_RE.test(trimmed)) return false;
  if (/\b(but|except|however|though|other than|aside from)\b/i.test(trimmed))
    return false;
  return true;
}

const TITLE_BY_STATUS: Record<
  'approved' | 'changes_requested' | 'comment',
  (a: string, c: string) => string
> = {
  approved: (a, c) => `${a} approved an edit on ${c}`,
  changes_requested: (a, c) => `${a} requested changes on ${c}`,
  comment: (a, c) => `${a} left a comment on ${c}`,
};

interface ShareLinkRow {
  id: string;
  project_id: string;
  expires_at: string;
  archived_at: string | null;
  all_approved_notified_at: string | null;
  revisions_complete_notified_at: string | null;
}

async function loadShareLink(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<
  | { ok: true; link: ShareLinkRow }
  | { ok: false; error: string; status: number }
> {
  const { data: link } = await admin
    .from('editing_project_share_links')
    .select(
      'id, project_id, expires_at, archived_at, all_approved_notified_at, revisions_complete_notified_at',
    )
    .eq('token', token)
    .maybeSingle<ShareLinkRow>();
  if (!link) return { ok: false, error: 'not_found', status: 404 };
  if (link.archived_at) return { ok: false, error: 'revoked', status: 410 };
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'expired', status: 410 };
  }
  return { ok: true, link };
}

interface ProjectChatContext {
  clientName: string;
  projectName: string;
  webhookUrl: string | null;
  shareUrl: string;
}

async function loadProjectChatContext(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  token: string,
): Promise<ProjectChatContext> {
  const { data: project } = await admin
    .from('editing_projects')
    .select('id, name, clients(name, agency)')
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      name: string;
      clients: { name: string | null; agency: string | null } | null;
    }>();

  const clientName = project?.clients?.name ?? 'Client';
  const projectName = project?.name ?? 'Project';
  const brand = getBrandFromAgency(project?.clients?.agency ?? null);
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
  // No per-client chat webhook on editing yet, so the ops space is the
  // only target. When it isn't configured, we just skip the chat ping.
  const webhookUrl = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  return {
    clientName,
    projectName,
    webhookUrl,
    shareUrl: `${appUrl}/c/edit/${token}`,
  };
}

async function checkAllVideosApproved(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<boolean> {
  const { data: videos } = await admin
    .from('editing_project_videos')
    .select('id')
    .eq('project_id', projectId)
    .returns<Array<{ id: string }>>();
  const videoIds = (videos ?? []).map((v) => v.id);
  if (videoIds.length === 0) return false;

  const { data: approvals } = await admin
    .from('editing_project_review_comments')
    .select('video_id')
    .in('video_id', videoIds)
    .eq('status', 'approved')
    .returns<Array<{ video_id: string | null }>>();
  const approvedSet = new Set(
    (approvals ?? [])
      .map((a) => a.video_id)
      .filter((id): id is string => !!id),
  );
  return videoIds.every((id) => approvedSet.has(id));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const linkResult = await loadShareLink(admin, token);
  if (!linkResult.ok) {
    return NextResponse.json(
      { error: linkResult.error },
      { status: linkResult.status },
    );
  }
  const link = linkResult.link;

  // If a video id is supplied, make sure it actually belongs to this
  // project — otherwise a malicious client could pin comments onto
  // someone else's videos by guessing UUIDs.
  if (parsed.data.videoId) {
    const { data: video } = await admin
      .from('editing_project_videos')
      .select('id')
      .eq('id', parsed.data.videoId)
      .eq('project_id', link.project_id)
      .maybeSingle<{ id: string }>();
    if (!video) {
      return NextResponse.json(
        { error: 'video_not_in_project' },
        { status: 400 },
      );
    }
  }

  // Smart approval upgrade: same rule as calendar. We tag the metadata
  // so the audit trail surfaces "auto approved from text" later. The
  // upgrade only fires on reviewer-typed statuses; system-generated
  // `video_revised` events never get auto-approved.
  const submittedStatus = parsed.data.status;
  const trimmedContent = parsed.data.content.trim();
  const inferredApproval =
    submittedStatus !== 'approved' &&
    submittedStatus !== 'video_revised' &&
    looksLikeApproval(trimmedContent);
  const finalStatus:
    | 'approved'
    | 'changes_requested'
    | 'comment'
    | 'video_revised' = inferredApproval ? 'approved' : submittedStatus;
  const insertMetadata: Record<string, unknown> = inferredApproval
    ? { auto_approved: true, original_status: submittedStatus }
    : {};

  // Only honour timestamps on plain comments + change requests.
  const timestampSeconds =
    finalStatus === 'comment' || finalStatus === 'changes_requested'
      ? parsed.data.timestampSeconds ?? null
      : null;

  const { data: inserted, error } = await admin
    .from('editing_project_review_comments')
    .insert({
      project_id: link.project_id,
      video_id: parsed.data.videoId ?? null,
      share_link_id: link.id,
      author_name: parsed.data.authorName.trim(),
      content: trimmedContent,
      status: finalStatus,
      attachments: parsed.data.attachments ?? [],
      metadata: insertMetadata,
      timestamp_seconds: timestampSeconds,
    })
    .select(
      'id, video_id, share_link_id, author_name, author_user_id, content, status, attachments, metadata, timestamp_seconds, created_at',
    )
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'failed' },
      { status: 500 },
    );
  }

  // For approved-status events, claim the right to post the celebration
  // ping atomically. Two concurrent approvers (or a single double-click)
  // would otherwise both pass a non-atomic "is everyone approved?" SELECT
  // and post twice. Only the request that flips all_approved_notified_at
  // NULL → timestamp wins. The DELETE handler clears the stamp when an
  // approval is removed, so re-approval can fire again.
  let allApprovedClaim: 'won' | 'lost' | 'not-yet' = 'not-yet';
  if (finalStatus === 'approved') {
    const everyoneApproved = await checkAllVideosApproved(
      admin,
      link.project_id,
    );
    if (everyoneApproved) {
      const { data: claimed } = await admin
        .from('editing_project_share_links')
        .update({ all_approved_notified_at: new Date().toISOString() })
        .eq('id', link.id)
        .is('all_approved_notified_at', null)
        .select('id')
        .maybeSingle();
      allApprovedClaim = claimed ? 'won' : 'lost';
    }
  }

  // Notify Jack (admin) so they can pull up the project. Mirrors the
  // calendar share notification pattern, minus the Monday + Zernio
  // legs that don't apply here. We skip notifications for the
  // synthesised `video_revised` audit row — that event is always
  // authored by an admin who's already on the page.
  if (finalStatus !== 'video_revised') {
    after(async () => {
      try {
        await notifyAdminsOfComment(admin, link.project_id, {
          authorName: parsed.data.authorName.trim(),
          content: trimmedContent,
          status: finalStatus,
          attachments: parsed.data.attachments ?? [],
        });
      } catch (err) {
        console.error('Editing comment notification failed:', err);
      }

      try {
        await postEditingChatForComment({
          admin,
          link,
          token,
          finalStatus,
          authorName: parsed.data.authorName.trim(),
          content: trimmedContent,
          attachments: parsed.data.attachments ?? [],
          allApprovedClaim,
        });
      } catch (err) {
        console.error('Editing comment chat ping failed:', err);
      }
    });
  }

  return NextResponse.json({ comment: inserted });
}

async function postEditingChatForComment(args: {
  admin: ReturnType<typeof createAdminClient>;
  link: ShareLinkRow;
  token: string;
  finalStatus: 'approved' | 'changes_requested' | 'comment' | 'video_revised';
  authorName: string;
  content: string;
  attachments: Array<{
    url: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
  }>;
  allApprovedClaim: 'won' | 'lost' | 'not-yet';
}) {
  const { webhookUrl, clientName, projectName, shareUrl } =
    await loadProjectChatContext(args.admin, args.link.project_id, args.token);
  if (!webhookUrl) return;

  if (
    args.finalStatus === 'comment' ||
    args.finalStatus === 'changes_requested' ||
    args.finalStatus === 'approved'
  ) {
    const setting = await getNotificationSetting('editing_comment_chat');
    if (!setting.enabled) return;
    const verb =
      args.finalStatus === 'changes_requested'
        ? 'requested changes'
        : args.finalStatus === 'approved'
          ? 'approved'
          : 'commented';
    const trimmed = args.content.trim();
    const quotedBlock = trimmed
      ? '\n' +
        trimmed
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      : '';
    const attachmentBlock =
      args.attachments.length > 0
        ? '\n\n' +
          args.attachments.map((a) => `📎 ${a.filename}\n${a.url}`).join('\n\n')
        : '';
    const text = `*${args.authorName}* ${verb} on ${clientName} · ${projectName}:${quotedBlock}${attachmentBlock}\n\n${shareUrl}`;
    postToGoogleChatSafe(
      webhookUrl,
      { text },
      `editing-comment ${args.link.id}`,
    );
  }

  if (args.allApprovedClaim === 'won') {
    const setting = await getNotificationSetting('editing_all_approved_chat');
    if (!setting.enabled) return;
    const text = `🎉 All cuts in ${clientName} · ${projectName} are approved.\n${shareUrl}`;
    postToGoogleChatSafe(
      webhookUrl,
      { text },
      `editing-all-approved ${args.link.id}`,
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const linkResult = await loadShareLink(admin, token);
  if (!linkResult.ok) {
    return NextResponse.json(
      { error: linkResult.error },
      { status: linkResult.status },
    );
  }
  const link = linkResult.link;

  const { data: comment } = await admin
    .from('editing_project_review_comments')
    .select('id, project_id, status')
    .eq('id', parsed.data.commentId)
    .maybeSingle<{ id: string; project_id: string; status: string }>();
  if (!comment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (comment.project_id !== link.project_id) {
    return NextResponse.json(
      { error: 'comment_not_in_project' },
      { status: 400 },
    );
  }

  const { error: delErr } = await admin
    .from('editing_project_review_comments')
    .delete()
    .eq('id', comment.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Approval revoked → clear the all-approved dedup stamp so a future
  // re-approval can fire the celebration ping again. Other status rows
  // (changes_requested, comment, video_revised) don't affect the stamp.
  if (comment.status === 'approved') {
    await admin
      .from('editing_project_share_links')
      .update({ all_approved_notified_at: null })
      .eq('id', link.id);
  }

  return NextResponse.json({ ok: true, commentId: comment.id });
}

/**
 * Toggle `metadata.resolved` on a `changes_requested` row so editors
 * can mark a revision as handled. Mirrors the calendar PATCH but skips
 * the "all revisions complete" Google Chat ping (no per-client webhook
 * configured for editing projects yet).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const linkResult = await loadShareLink(admin, token);
  if (!linkResult.ok) {
    return NextResponse.json(
      { error: linkResult.error },
      { status: linkResult.status },
    );
  }
  const link = linkResult.link;

  const { data: comment } = await admin
    .from('editing_project_review_comments')
    .select('id, project_id, status, metadata')
    .eq('id', parsed.data.commentId)
    .maybeSingle<{
      id: string;
      project_id: string;
      status: string;
      metadata: Record<string, unknown> | null;
    }>();
  if (!comment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (comment.project_id !== link.project_id) {
    return NextResponse.json(
      { error: 'comment_not_in_project' },
      { status: 400 },
    );
  }
  if (comment.status !== 'changes_requested') {
    return NextResponse.json(
      { error: 'only_revision_requests_can_be_resolved' },
      { status: 400 },
    );
  }

  const existing = comment.metadata ?? {};
  const nextMetadata: Record<string, unknown> = parsed.data.resolved
    ? { ...existing, resolved: true, resolved_at: new Date().toISOString() }
    : { ...existing, resolved: false, resolved_at: null };

  const { data: updated, error } = await admin
    .from('editing_project_review_comments')
    .update({ metadata: nextMetadata })
    .eq('id', comment.id)
    .select(
      'id, video_id, share_link_id, author_name, author_user_id, content, status, attachments, metadata, timestamp_seconds, created_at',
    )
    .single();
  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'failed' },
      { status: 500 },
    );
  }

  // After the toggle, see if this transition closed the revision pass for
  // the entire share link. We only fire the "all revisions ready, please
  // re-review" chat ping when unresolved goes from N>0 to 0, and dedup via
  // `revisions_complete_notified_at` so toggling doesn't spam. If the
  // editor un-marks one (unresolved 0 → 1), the stamp is cleared so the
  // next completion fires again.
  after(async () => {
    try {
      await maybeFireEditingRevisionsCompleteNotification(admin, {
        link,
        token,
      });
    } catch (err) {
      console.error('Editing revisions-complete notify check failed:', err);
    }
  });

  return NextResponse.json({ comment: updated });
}

async function maybeFireEditingRevisionsCompleteNotification(
  admin: ReturnType<typeof createAdminClient>,
  args: { link: ShareLinkRow; token: string },
) {
  // Count `changes_requested` rows scoped to this share link. We could
  // scope by project, but the share link is the user-facing surface and
  // matches calendar's behaviour (per-link dedup stamp).
  const { data: changeRows } = await admin
    .from('editing_project_review_comments')
    .select('id, metadata')
    .eq('share_link_id', args.link.id)
    .eq('status', 'changes_requested')
    .returns<Array<{ id: string; metadata: Record<string, unknown> | null }>>();

  const total = changeRows?.length ?? 0;
  if (total === 0) return; // never had revisions, nothing to wrap up

  const unresolved = (changeRows ?? []).filter((c) => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.resolved !== true;
  }).length;

  if (unresolved > 0) {
    // Editor un-marked something, reset dedup so a future completion fires.
    if (args.link.revisions_complete_notified_at) {
      await admin
        .from('editing_project_share_links')
        .update({ revisions_complete_notified_at: null })
        .eq('id', args.link.id);
    }
    return;
  }

  if (args.link.revisions_complete_notified_at) return;

  const { webhookUrl, clientName, projectName, shareUrl } =
    await loadProjectChatContext(admin, args.link.project_id, args.token);

  if (webhookUrl) {
    const text =
      `✅ All revisions are ready for *${clientName} · ${projectName}*.\n` +
      `Take another look and approve the cuts that are good to go:\n${shareUrl}`;
    postToGoogleChatSafe(
      webhookUrl,
      { text },
      `editing-revisions-complete ${args.link.id}`,
    );
  }

  await admin
    .from('editing_project_share_links')
    .update({ revisions_complete_notified_at: new Date().toISOString() })
    .eq('id', args.link.id);
}

async function notifyAdminsOfComment(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  comment: {
    authorName: string;
    content: string;
    status: 'approved' | 'changes_requested' | 'comment' | 'video_revised';
    attachments: Array<{
      url: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
    }>;
  },
) {
  // video_revised events are admin-authored audit rows; we never page
  // ourselves on them. The caller already short-circuits but we keep
  // this guard so the helper stays self-contained.
  const visibleStatus = comment.status;
  if (visibleStatus === 'video_revised') return;
  const { data: project } = await admin
    .from('editing_projects')
    .select(
      'id, name, client:clients!editing_projects_client_id_fkey(name)',
    )
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      name: string;
      client: { name: string | null } | null;
    }>();
  if (!project) return;

  const clientName = project.client?.name ?? project.name;
  const title = TITLE_BY_STATUS[visibleStatus](
    comment.authorName,
    clientName,
  );
  const preview = comment.content.trim()
    ? comment.content.slice(0, 140) +
      (comment.content.length > 140 ? '…' : '')
    : comment.attachments.length === 1
      ? `📎 ${comment.attachments[0].filename}`
      : comment.attachments.length > 1
        ? `📎 ${comment.attachments.length} files attached`
        : 'No additional notes';

  const linkPath = `/admin/editing?project=${project.id}`;

  // In-app: Jack only (matches calendar pattern). Future: route by
  // project editor / strategist.
  const { data: jack } = await admin
    .from('users')
    .select('id')
    .eq('email', 'jack@nativz.io')
    .maybeSingle<{ id: string }>();
  if (jack?.id) {
    createNotification({
      recipientUserId: jack.id,
      type: 'general',
      title,
      body: preview,
      linkPath,
    }).catch(() => {});
  }
}
