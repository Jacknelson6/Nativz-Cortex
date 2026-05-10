import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendEditingCadenceFollowupEmail,
  type CadenceStage,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import { archiveEditingShareLinkEmail } from '@/lib/content-tools/archive-editing-share-email';
import { notifyAdmins } from '@/lib/notifications';
import { nounForProjectType } from '@/lib/editing/project-noun';

export const maxDuration = 60;

/**
 * GET /api/cron/editing-reminders
 *
 * Editing-side mirror of /api/cron/calendar-reminders. Anchor is the
 * most recent client-facing send (`last_review_email_sent_at`). When
 * the client has left zero comments / approvals / change requests
 * since, we step through:
 *
 *   T+72h  → followup 1   ("just wanted to follow up")
 *   T+120h → followup 2   ("just in case you missed this")
 *   T+168h → followup 3   ("last check before we mark this approved")
 *   T+216h → auto-approve every still-pending cut on the link
 *
 * Each send drops an in-app Cortex notification + an ops Google Chat
 * ping so the team can track follow-up volume.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  type ShareLinkRow = {
    id: string;
    project_id: string;
    token: string;
    last_review_email_sent_at: string | null;
    last_viewed_at: string | null;
    followup_1_sent_at: string | null;
    followup_2_sent_at: string | null;
    followup_3_sent_at: string | null;
    auto_approved_at: string | null;
    all_approved_notified_at: string | null;
    archived_at: string | null;
    expires_at: string;
    last_followup_at: string | null;
    followup_count: number | null;
    editing_projects: {
      id: string;
      name: string | null;
      project_type: string | null;
      client_id: string;
      clients: {
        id: string;
        name: string;
        agency: string | null;
      } | null;
    } | null;
  };

  const { data: shareLinks, error } = await admin
    .from('editing_project_share_links')
    .select(`
      id,
      project_id,
      token,
      last_review_email_sent_at,
      last_viewed_at,
      followup_1_sent_at,
      followup_2_sent_at,
      followup_3_sent_at,
      auto_approved_at,
      all_approved_notified_at,
      archived_at,
      expires_at,
      last_followup_at,
      followup_count,
      editing_projects!inner (
        id,
        name,
        project_type,
        client_id,
        clients!inner ( id, name, agency )
      )
    `)
    .is('auto_approved_at', null)
    .is('archived_at', null)
    .not('last_review_email_sent_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .returns<ShareLinkRow[]>();

  if (error) {
    console.error('editing-reminders: query failed:', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const now = Date.now();
  const counts = { stage1: 0, stage2: 0, stage3: 0, autoApproved: 0, skipped: 0 };

  for (const link of shareLinks ?? []) {
    const project = link.editing_projects;
    const client = project?.clients ?? null;
    if (!project || !client || !link.last_review_email_sent_at) {
      counts.skipped += 1;
      continue;
    }

    const sentMs = new Date(link.last_review_email_sent_at).getTime();
    const ageHours = (now - sentMs) / (1000 * 60 * 60);
    if (ageHours < 72) {
      counts.skipped += 1;
      continue;
    }

    // Any reviewer activity since the last send cancels the cadence.
    const hasActivity = await hasClientActivitySince(
      admin,
      link.id,
      link.last_review_email_sent_at,
    );
    if (hasActivity) {
      counts.skipped += 1;
      continue;
    }

    const { pending, total } = await countPendingVideos(admin, project.id);
    if (pending === 0) {
      counts.skipped += 1;
      continue;
    }

    const recipients = await getClientNotificationRecipients(admin, client.id);
    if (recipients.length === 0) {
      counts.skipped += 1;
      continue;
    }

    const brand = getBrandFromAgency(client.agency);
    const appUrl = process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
    const shareUrl = `${appUrl}/s/${link.token}`;
    const projectName = project.name?.trim() || client.name;
    const pocFirstNames = recipients.map((c) => firstName(c.name));
    const noun = nounForProjectType(project.project_type);

    // Auto-approve sweep at T+216h. Fires once per link.
    const autoApproveSetting = await getClientNotificationSetting(
      'editing_auto_approve',
      'email',
      client.id,
    );
    if (ageHours >= 216 && autoApproveSetting.enabled) {
      const autoApproved = await autoApprovePending(admin, {
        link,
        project: { id: project.id, name: projectName, noun },
        client,
        shareUrl,
      });
      if (autoApproved) counts.autoApproved += 1;
      else counts.skipped += 1;
      continue;
    }

    let stage: CadenceStage | null = null;
    if (ageHours >= 168 && !link.followup_3_sent_at) stage = 3;
    else if (ageHours >= 120 && !link.followup_2_sent_at) stage = 2;
    else if (ageHours >= 72 && !link.followup_1_sent_at) stage = 1;

    if (stage === null) {
      counts.skipped += 1;
      continue;
    }

    const cadenceSetting = await getClientNotificationSetting(
      'editing_followup_cadence',
      'email',
      client.id,
    );
    if (!cadenceSetting.enabled) {
      counts.skipped += 1;
      continue;
    }

    try {
      const result = await sendEditingCadenceFollowupEmail({
        to: recipients.map((c) => c.email),
        stage,
        pocFirstNames,
        clientName: client.name,
        projectName,
        shareUrl,
        agency: brand,
        clientId: client.id,
        projectId: project.id,
        noun,
      });
      if (!result.ok) {
        console.error('editing-reminders: send failed:', result.error);
        continue;
      }

      const subjectByStage: Record<CadenceStage, string> = {
        1: `Following up on ${projectName}`,
        2: `Quick check-in on ${projectName}`,
        3: `Last check before we mark ${projectName} approved`,
      };
      const archiveKindByStage: Record<
        CadenceStage,
        'auto_followup_open' | 'auto_followup_action' | 'auto_followup_final'
      > = {
        1: 'auto_followup_open',
        2: 'auto_followup_action',
        3: 'auto_followup_final',
      };

      await archiveEditingShareLinkEmail(admin, {
        shareLinkId: link.id,
        kind: archiveKindByStage[stage],
        subject: subjectByStage[stage],
        htmlBody: result.html,
        recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
        sentBy: null,
      });

      const stampIso = new Date().toISOString();
      const stampField = `followup_${stage}_sent_at` as const;
      const nextCount = (link.followup_count ?? 0) + 1;
      await admin
        .from('editing_project_share_links')
        .update({
          [stampField]: stampIso,
          last_followup_at: stampIso,
          followup_count: nextCount,
        })
        .eq('id', link.id);

      const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
      const stageLabel = stage === 3 ? 'Final call' : `Follow-up ${stage}`;
      postToGoogleChatSafe(
        opsWebhook,
        {
          text: `📣 ${stageLabel} sent to *${client.name}* on *${projectName}*, ${pending}/${total} ${noun.plural} still pending. ${shareUrl}`,
        },
        `editing_cadence_ops:${link.id}:${stage}`,
      );

      await notifyAdmins({
        type: 'followup_sent',
        clientId: client.id,
        title: `${stageLabel} sent to ${client.name}`,
        body: `${pending} of ${total} ${noun.plural} on ${projectName} still need their eyes.`,
        linkPath: `/admin/editing/projects/${project.id}`,
      });

      if (stage === 1) counts.stage1 += 1;
      if (stage === 2) counts.stage2 += 1;
      if (stage === 3) counts.stage3 += 1;
    } catch (e) {
      console.error('editing-reminders: send loop error:', e);
    }
  }

  return NextResponse.json({
    message: 'editing cadence sweep complete',
    scanned: shareLinks?.length ?? 0,
    ...counts,
  });
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

/**
 * Reviewer activity = any non-system comment on this share link since
 * `since`. The synthesised `video_revised` event is admin-authored, so
 * it doesn't count as client activity.
 */
async function hasClientActivitySince(
  admin: ReturnType<typeof createAdminClient>,
  shareLinkId: string,
  since: string,
): Promise<boolean> {
  const { count } = await admin
    .from('editing_project_review_comments')
    .select('id', { count: 'exact', head: true })
    .eq('share_link_id', shareLinkId)
    .in('status', ['approved', 'changes_requested', 'comment'])
    .gt('created_at', since);
  return (count ?? 0) > 0;
}

/**
 * Pending = videos on the project that don't have an approved review
 * comment keyed to them. Mirrors `checkAllVideosApproved` from the
 * public comment route so the cadence cancellation matches what the
 * UI considers "all approved".
 */
async function countPendingVideos(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<{ pending: number; total: number }> {
  const { data: videos } = await admin
    .from('editing_project_videos')
    .select('id')
    .eq('project_id', projectId)
    .returns<Array<{ id: string }>>();
  const videoIds = (videos ?? []).map((v) => v.id);
  const total = videoIds.length;
  if (total === 0) return { pending: 0, total: 0 };

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
  const pending = videoIds.filter((id) => !approvedSet.has(id)).length;
  return { pending, total };
}

/**
 * Auto-approve every still-pending video by inserting one approved
 * review comment per video, authored by Cortex. Stamps `auto_approved_at`
 * + `all_approved_notified_at` so the celebration ping is suppressed
 * (we already post a dedicated auto-approve message).
 */
async function autoApprovePending(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    link: {
      id: string;
      project_id: string;
      all_approved_notified_at: string | null;
    };
    project: {
      id: string;
      name: string;
      noun: { singular: string; plural: string };
    };
    client: { id: string; name: string };
    shareUrl: string;
  },
): Promise<boolean> {
  const { link, project, client } = args;
  const { noun } = project;

  const { data: videos } = await admin
    .from('editing_project_videos')
    .select('id')
    .eq('project_id', project.id)
    .returns<Array<{ id: string }>>();
  const videoIds = (videos ?? []).map((v) => v.id);

  if (videoIds.length === 0) {
    await admin
      .from('editing_project_share_links')
      .update({ auto_approved_at: new Date().toISOString() })
      .eq('id', link.id);
    return false;
  }

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
  const pendingVideoIds = videoIds.filter((id) => !approvedSet.has(id));

  if (pendingVideoIds.length === 0) {
    await admin
      .from('editing_project_share_links')
      .update({ auto_approved_at: new Date().toISOString() })
      .eq('id', link.id);
    return false;
  }

  const noteDate = new Date().toISOString().slice(0, 10);
  const commentInserts = pendingVideoIds.map((videoId) => ({
    project_id: project.id,
    video_id: videoId,
    share_link_id: link.id,
    author_name: 'Cortex auto-approve',
    content: `Auto-approved on ${noteDate} after no client activity for 9 days.`,
    status: 'approved' as const,
  }));
  await admin.from('editing_project_review_comments').insert(commentInserts);

  const stampIso = new Date().toISOString();
  await admin
    .from('editing_project_share_links')
    .update({
      auto_approved_at: stampIso,
      // Suppress the "all approved" celebration ping, we post our own
      // auto-approve message below.
      all_approved_notified_at: link.all_approved_notified_at ?? stampIso,
    })
    .eq('id', link.id);

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  postToGoogleChatSafe(
    opsWebhook,
    {
      text: `✅ Auto-approved *${pendingVideoIds.length}* ${noun.plural} on *${client.name} · ${project.name}*, no client activity for 9 days. ${args.shareUrl}`,
    },
    `editing_cadence_ops_auto_approve:${link.id}`,
  );

  await notifyAdmins({
    type: 'followup_sent',
    clientId: client.id,
    title: `Auto-approved ${pendingVideoIds.length} ${noun.plural} on ${project.name}`,
    body: `No client activity for 9 days. Project is ready to ship.`,
    linkPath: `/admin/editing/projects/${project.id}`,
  });

  return true;
}

export const GET = withCronTelemetry(
  { route: '/api/cron/editing-reminders' },
  handleGet,
);
