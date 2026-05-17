import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getShareContextOrNull, resolveBoundIdentity } from '@/lib/share/identity';
import { notifyViewersOfShareEvent } from '@/lib/share/notify-viewers';
import {
  buildChatCard,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { resolvePaidMediaWebhook } from '@/lib/chat/resolve-paid-media-webhook';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';
import { nounForProjectType } from '@/lib/editing/project-noun';

export const dynamic = 'force-dynamic';

/**
 * Public comment endpoints for the editing-project review page.
 *
 * Migration 322 unified `changes_requested` into `comment`. A comment
 * without Approve IS the revision request; comment + Approve = approval
 * with notes. Admin bell pings are deferred to /api/cron/coalesce-review-pings,
 * mirroring the chat bundler. The PATCH/resolve handler and the
 * "all revisions complete" pattern were removed.
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
    status: z.enum(['approved', 'comment', 'video_revised']),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    // Frame-anchor in seconds (for plain comments + replies).
    timestampSeconds: z.number().min(0).max(86400).nullable().optional(),
    // Replies hang off any prior comment in the same project. Unlimited
    // depth at the DB layer; UI flattens past visual depth 4.
    parentCommentId: z.string().uuid().nullable().optional(),
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

interface ShareLinkRow {
  id: string;
  project_id: string;
  expires_at: string;
  archived_at: string | null;
  all_approved_notified_at: string | null;
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
      'id, project_id, expires_at, archived_at, all_approved_notified_at',
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
  clientId: string | null;
  clientName: string;
  projectName: string;
  projectType: string | null;
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
    .select('id, name, project_type, client_id, clients(name, agency, chat_webhook_url)')
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      name: string;
      project_type: string | null;
      client_id: string | null;
      clients: {
        name: string | null;
        agency: string | null;
        chat_webhook_url: string | null;
      } | null;
    }>();

  const clientId = project?.client_id ?? null;
  const clientName = project?.clients?.name ?? 'Client';
  const projectName = project?.name ?? 'Project';
  const projectType = project?.project_type ?? null;
  const brand = getBrandFromAgency(project?.clients?.agency ?? null);
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
  const webhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: project?.clients?.chat_webhook_url ?? null,
    agency: project?.clients?.agency ?? null,
  });
  return {
    clientId,
    clientName,
    projectName,
    projectType,
    webhookUrl,
    shareUrl: `${appUrl}/s/${token}`,
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

  // Guard against pinning comments onto a video that isn't in this project.
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

  // Parent validation: same project + reply rows force status='comment'.
  // Depth is otherwise unrestricted.
  let parentCommentId: string | null = null;
  if (parsed.data.parentCommentId) {
    const { data: parent } = await admin
      .from('editing_project_review_comments')
      .select('id, project_id')
      .eq('id', parsed.data.parentCommentId)
      .maybeSingle<{ id: string; project_id: string }>();
    if (!parent || parent.project_id !== link.project_id) {
      return NextResponse.json(
        { error: 'parent_comment_not_in_project' },
        { status: 400 },
      );
    }
    parentCommentId = parent.id;
  }

  const submittedStatus = parsed.data.status;
  const trimmedContent = parsed.data.content.trim();
  // Reply rows are always conversation; never approval / video_revised.
  const finalStatus: 'approved' | 'comment' | 'video_revised' =
    parentCommentId ? 'comment' : submittedStatus;

  const timestampSeconds =
    finalStatus === 'comment' ? parsed.data.timestampSeconds ?? null : null;

  // PRD 05: derive author_role + author_user_id from the bound session.
  const shareContext = await getShareContextOrNull(token);
  let authorRole: 'admin' | 'viewer' | 'guest' = 'guest';
  let authorUserId: string | null = null;
  if (shareContext) {
    const { identity } = await resolveBoundIdentity(shareContext);
    if (identity) {
      authorUserId = identity.userId;
      authorRole =
        identity.role === 'admin' || identity.role === 'super_admin'
          ? 'admin'
          : identity.role === 'viewer'
            ? 'viewer'
            : 'guest';
    }
  }

  // Migration 322: kind collapsed to feedback | approval | video_revised.
  // Admin-vs-viewer is derived from author_role at render time.
  const insertKind: 'feedback' | 'approval' | 'video_revised' =
    finalStatus === 'approved'
      ? 'approval'
      : finalStatus === 'video_revised'
        ? 'video_revised'
        : 'feedback';

  const { data: inserted, error } = await admin
    .from('editing_project_review_comments')
    .insert({
      project_id: link.project_id,
      video_id: parsed.data.videoId ?? null,
      share_link_id: link.id,
      author_name: parsed.data.authorName.trim(),
      author_user_id: authorUserId,
      author_role: authorRole,
      content: trimmedContent,
      status: finalStatus,
      kind: insertKind,
      attachments: parsed.data.attachments ?? [],
      metadata: {},
      timestamp_seconds: timestampSeconds,
      parent_comment_id: parentCommentId,
    })
    .select(
      'id, video_id, share_link_id, author_name, author_user_id, author_role, content, status, kind, attachments, metadata, timestamp_seconds, parent_comment_id, created_at',
    )
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'failed' },
      { status: 500 },
    );
  }

  // All-approved claim: only the request that flips NULL → timestamp wins.
  // Per-event admin bells flow through the coalesce cron; this celebration
  // stays single-shot.
  let allApprovedClaim: 'won' | 'lost' | 'not-yet' = 'not-yet';
  if (finalStatus === 'approved') {
    const everyoneApproved = await checkAllVideosApproved(
      admin,
      link.project_id,
    );
    if (everyoneApproved) {
      const nowIso = new Date().toISOString();
      const { data: claimed } = await admin
        .from('editing_project_share_links')
        .update({ all_approved_notified_at: nowIso })
        .eq('id', link.id)
        .is('all_approved_notified_at', null)
        .select('id')
        .maybeSingle();
      allApprovedClaim = claimed ? 'won' : 'lost';
      if (allApprovedClaim === 'won') {
        await admin
          .from('editing_projects')
          .update({ status: 'approved', approved_at: nowIso })
          .eq('id', link.project_id)
          .neq('status', 'approved');
      }
    }
  }

  // video_revised events are admin-authored audit rows; no notifications.
  if (finalStatus !== 'video_revised') {
    after(async () => {
      // PRD 08: admin-authored events land in viewer portal bells.
      if (authorRole === 'admin') {
        try {
          const { data: project } = await admin
            .from('editing_projects')
            .select('client_id, name, clients(name)')
            .eq('id', link.project_id)
            .maybeSingle<{
              client_id: string | null;
              name: string | null;
              clients: { name: string | null } | null;
            }>();
          const brandLabel =
            project?.clients?.name ?? project?.name ?? 'your project';
          const title =
            finalStatus === 'approved'
              ? `${parsed.data.authorName.trim()} approved a clip on ${brandLabel}`
              : `${parsed.data.authorName.trim()} replied on ${brandLabel}`;
          const preview = trimmedContent
            ? trimmedContent.slice(0, 140) + (trimmedContent.length > 140 ? '…' : '')
            : '';
          await notifyViewersOfShareEvent({
            clientId: project?.client_id ?? null,
            title,
            body: preview,
            linkPath: `/s/${token}`,
            type: 'feedback_received',
          });
        } catch (err) {
          console.error('Viewer notification (editing) failed:', err);
        }
      }

      try {
        await postEditingChatForComment({
          admin,
          link,
          token,
          allApprovedClaim,
        });
      } catch (err) {
        console.error('Editing comment chat ping failed:', err);
      }

      if (allApprovedClaim === 'won') {
        try {
          await pingPaidMediaForEditingApproval({
            admin,
            projectId: link.project_id,
            linkId: link.id,
            token,
          });
        } catch (err) {
          console.error('Editing paid-media ping failed:', err);
        }
      }
    });
  }

  return NextResponse.json({ comment: inserted });
}

async function postEditingChatForComment(args: {
  admin: ReturnType<typeof createAdminClient>;
  link: ShareLinkRow;
  token: string;
  allApprovedClaim: 'won' | 'lost' | 'not-yet';
}) {
  if (args.allApprovedClaim !== 'won') return;

  // Stamp pending approval rows so the bundler skips them. Comments stay
  // NULL so they still bundle on their own.
  const { error: stampErr } = await args.admin
    .from('editing_project_review_comments')
    .update({ chat_notified_at: new Date().toISOString() })
    .eq('share_link_id', args.link.id)
    .eq('status', 'approved')
    .is('chat_notified_at', null);
  if (stampErr) {
    console.error(
      'editing-comment: stamping pending approvals after all-approved failed',
      stampErr,
    );
  }

  const { clientId, webhookUrl, clientName, projectName, projectType, shareUrl } =
    await loadProjectChatContext(args.admin, args.link.project_id, args.token);
  if (!webhookUrl) return;

  const setting = await getClientNotificationSetting(
    'editing_all_approved_chat',
    'chat',
    clientId,
  );
  if (!setting.enabled) return;
  const noun = nounForProjectType(projectType);
  postToGoogleChatSafe(
    webhookUrl,
    buildChatCard({
      cardId: `editing-all-approved-${args.link.id}`,
      headerTitle: `🎉 Every ${noun.singular} approved`,
      headerSubtitle: `${clientName} · ${projectName}`,
      sections: [
        {
          widgets: [
            {
              type: 'text',
              text: `Client approved every ${noun.singular} in this project. It's marked done, no team action needed.`,
            },
            {
              type: 'button',
              text: 'Open project',
              url: shareUrl,
              filled: true,
            },
          ],
        },
      ],
      fallbackText: `🎉 ${clientName} · ${projectName}, client approved every ${noun.singular}. ${shareUrl}`,
    }),
    `editing-all-approved ${args.link.id}`,
  );
}

async function pingPaidMediaForEditingApproval(args: {
  admin: ReturnType<typeof createAdminClient>;
  projectId: string;
  linkId: string;
  token: string;
}) {
  const { data: project } = await args.admin
    .from('editing_projects')
    .select('client_id, clients(name, agency)')
    .eq('id', args.projectId)
    .maybeSingle<{
      client_id: string | null;
      clients: { name: string | null; agency: string | null } | null;
    }>();

  const clientName = project?.clients?.name ?? 'Client';
  const paidMediaSetting = await getClientNotificationSetting(
    'editing_paid_media_chat',
    'chat',
    project?.client_id ?? null,
  );
  if (!paidMediaSetting.enabled) return;
  const paidMedia = await resolvePaidMediaWebhook(args.admin, {
    clientId: project?.client_id ?? null,
    clientName,
  });
  if (!paidMedia) return;

  const brand = getBrandFromAgency(project?.clients?.agency ?? null);
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
  const downloadUrl = `${appUrl}/c/edit/${args.token}/download`;

  postToGoogleChatSafe(
    paidMedia.url,
    buildChatCard({
      cardId: `paid-media-editing-${args.linkId}`,
      headerTitle: '🎬 Approved for Meta ads',
      headerSubtitle: clientName,
      sections: [
        {
          widgets: [
            {
              type: 'text',
              text: 'Client approved every clip in this editing project. Final cuts are cleared to run as Meta ads.',
            },
            {
              type: 'button',
              text: 'Download all assets',
              url: downloadUrl,
              filled: true,
            },
          ],
        },
      ],
    }),
    `paid-media-approved-editing ${args.linkId}`,
  );
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

  if (comment.status === 'approved') {
    await admin
      .from('editing_project_share_links')
      .update({ all_approved_notified_at: null })
      .eq('id', link.id);
    await admin
      .from('editing_projects')
      .update({ status: 'need_approval', approved_at: null })
      .eq('id', link.project_id)
      .eq('status', 'approved');
  }

  return NextResponse.json({ ok: true, commentId: comment.id });
}
