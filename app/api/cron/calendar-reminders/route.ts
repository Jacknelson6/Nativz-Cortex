import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendCalendarCadenceFollowupEmail,
  type CadenceStage,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import { archiveShareLinkEmail } from '@/lib/content-tools/archive-share-email';
import { notifyAdmins } from '@/lib/notifications';

export const maxDuration = 60;

/**
 * GET /api/cron/calendar-reminders
 *
 * Unified follow-up cadence on content_drop_share_links. Anchor is
 * `last_sent_at` (the most recent client-facing send). When the client
 * has left zero comments / approvals / change requests since that send,
 * we step through:
 *
 *   T+72h  → followup 1   ("just wanted to follow up")
 *   T+120h → followup 2   ("just in case you missed this")
 *   T+168h → followup 3   ("final call before we publish")
 *   T+216h → auto-approve every still-pending post on the link
 *
 * Any reviewer activity in the window cancels the cadence for that link.
 * Each send also drops an in-app Cortex notification ("Sent follow-up N
 * to {client}") and a Google Chat ping into the ops space so we can
 * track follow-up volume centrally.
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
    drop_id: string;
    token: string;
    included_post_ids: string[];
    last_sent_at: string | null;
    last_viewed_at: string | null;
    followup_1_sent_at: string | null;
    followup_2_sent_at: string | null;
    followup_3_sent_at: string | null;
    auto_approved_at: string | null;
    followup_count: number | null;
    archived_at: string | null;
    expires_at: string;
    content_drops: {
      id: string;
      client_id: string;
      clients: {
        id: string;
        name: string;
        agency: string | null;
      } | null;
    } | null;
  };

  const { data: shareLinks, error } = await admin
    .from('content_drop_share_links')
    .select(`
      id,
      drop_id,
      token,
      included_post_ids,
      last_sent_at,
      last_viewed_at,
      followup_1_sent_at,
      followup_2_sent_at,
      followup_3_sent_at,
      auto_approved_at,
      followup_count,
      archived_at,
      expires_at,
      content_drops!inner (
        id,
        client_id,
        clients!inner ( id, name, agency )
      )
    `)
    .is('auto_approved_at', null)
    .is('archived_at', null)
    .not('last_sent_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .returns<ShareLinkRow[]>();

  if (error) {
    console.error('calendar-reminders: query failed:', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const now = Date.now();
  const counts = { stage1: 0, stage2: 0, stage3: 0, autoApproved: 0, skipped: 0 };

  for (const link of shareLinks ?? []) {
    const client = link.content_drops?.clients;
    if (!client || !link.last_sent_at) {
      counts.skipped += 1;
      continue;
    }

    const sentMs = new Date(link.last_sent_at).getTime();
    const ageHours = (now - sentMs) / (1000 * 60 * 60);
    if (ageHours < 72) {
      counts.skipped += 1;
      continue;
    }

    // Any reviewer activity since the last send cancels the cadence.
    const hasActivity = await hasClientActivitySince(
      admin,
      link.included_post_ids,
      link.last_sent_at,
    );
    if (hasActivity) {
      counts.skipped += 1;
      continue;
    }

    // What's still in the client's court? If everything is approved or
    // sitting in our court (revisions to deliver), we don't nudge.
    const { pending, total, hasRevisionFeedback } = await countPendingPosts(
      admin,
      link.included_post_ids,
    );
    if (pending === 0 || hasRevisionFeedback) {
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
    const pocFirstNames = recipients.map((c) => firstName(c.name));

    // Auto-approve sweep at T+216h. Fires once per link and stamps
    // auto_approved_at so we never re-enter for this link.
    const autoApproveSetting = await getClientNotificationSetting(
      'calendar_auto_approve',
      'email',
      client.id,
    );
    if (ageHours >= 216 && autoApproveSetting.enabled) {
      const autoApproved = await autoApprovePending(admin, {
        link,
        client,
        shareUrl,
        pending,
        total,
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
      'calendar_followup_cadence',
      'email',
      client.id,
    );
    if (!cadenceSetting.enabled) {
      counts.skipped += 1;
      continue;
    }

    try {
      const result = await sendCalendarCadenceFollowupEmail({
        to: recipients.map((c) => c.email),
        stage,
        pocFirstNames,
        clientName: client.name,
        shareUrl,
        agency: brand,
        clientId: client.id,
        dropId: link.drop_id,
      });
      if (!result.ok) {
        console.error('calendar-reminders: send failed:', result.error);
        continue;
      }

      const subjectByStage: Record<CadenceStage, string> = {
        1: `Following up on ${client.name}'s content calendar`,
        2: `Quick check-in on ${client.name}'s content calendar`,
        3: `Final call before we publish ${client.name}'s content calendar`,
      };
      const archiveKindByStage: Record<
        CadenceStage,
        'auto_followup_open' | 'auto_followup_action' | 'auto_followup_final'
      > = {
        1: 'auto_followup_open',
        2: 'auto_followup_action',
        3: 'auto_followup_final',
      };

      await archiveShareLinkEmail(admin, {
        shareLinkId: link.id,
        kind: archiveKindByStage[stage],
        subject: subjectByStage[stage],
        htmlBody: result.html,
        recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
        sentBy: null,
      });

      const stampIso = new Date().toISOString();
      const stampField = `followup_${stage}_sent_at` as const;
      await admin
        .from('content_drop_share_links')
        .update({
          [stampField]: stampIso,
          last_followup_at: stampIso,
          followup_count: (link.followup_count ?? 0) + 1,
        })
        .eq('id', link.id);

      // Ops chat ping so the team can track follow-up volume.
      const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
      const stageLabel = stage === 3 ? 'Final call' : `Follow-up ${stage}`;
      postToGoogleChatSafe(
        opsWebhook,
        {
          text:
            `📣 *${client.name}* — ${stageLabel} follow-up email auto-sent to the client by the cron ` +
            `(${pending}/${total} posts still need approval). FYI, no team action needed unless the client goes dark through the final call.\n${shareUrl}`,
        },
        `cadence_ops:${link.id}:${stage}`,
      );

      // In-app Cortex notification for the team. notifyAdmins scopes to
      // members assigned to this client + owners.
      await notifyAdmins({
        type: 'followup_sent',
        clientId: client.id,
        title: `${stageLabel} sent to ${client.name}`,
        body: `${pending} of ${total} posts still need their eyes.`,
        linkPath: `/admin/calendar/${link.drop_id}`,
      });

      if (stage === 1) counts.stage1 += 1;
      if (stage === 2) counts.stage2 += 1;
      if (stage === 3) counts.stage3 += 1;
    } catch (e) {
      console.error('calendar-reminders: send loop error:', e);
    }
  }

  return NextResponse.json({
    message: 'cadence sweep complete',
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
 * True if any reviewer comment exists on a post in this link since
 * `since`. Reviewer activity = any row in `post_review_comments` with
 * status approved / changes_requested / comment, joined through
 * `post_review_links`. Editor force-approve writes the same shape, but
 * those are rare and the cadence cancelling on them is the conservative
 * behaviour anyway.
 */
async function hasClientActivitySince(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
  since: string,
): Promise<boolean> {
  if (postIds.length === 0) return false;
  const { count } = await admin
    .from('post_review_comments')
    .select('id, post_review_links!inner(post_id)', { count: 'exact', head: true })
    .in('status', ['approved', 'changes_requested', 'comment'])
    .in('post_review_links.post_id', postIds)
    .gt('created_at', since);
  return (count ?? 0) > 0;
}

async function countPendingPosts(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
): Promise<{
  pending: number;
  total: number;
  hasRevisionFeedback: boolean;
}> {
  const total = postIds.length;
  if (total === 0) return { pending: 0, total: 0, hasRevisionFeedback: false };

  type Row = {
    created_at: string;
    status: 'approved' | 'changes_requested';
    post_review_links:
      | { post_id: string; revisions_completed_at: string | null }
      | { post_id: string; revisions_completed_at: string | null }[]
      | null;
  };
  const { data } = await admin
    .from('post_review_comments')
    .select('created_at, status, post_review_links!inner(post_id, revisions_completed_at)')
    .in('status', ['approved', 'changes_requested'])
    .in('post_review_links.post_id', postIds)
    .order('created_at', { ascending: false })
    .returns<Row[]>();

  const latestByPost = new Map<
    string,
    { status: 'approved' | 'changes_requested'; created_at: string; revisions_completed_at: string | null }
  >();
  let hasRevisionFeedback = false;
  for (const row of data ?? []) {
    const link = Array.isArray(row.post_review_links)
      ? row.post_review_links[0] ?? null
      : row.post_review_links;
    if (!link) continue;
    if (row.status === 'changes_requested') hasRevisionFeedback = true;
    if (latestByPost.has(link.post_id)) continue;
    latestByPost.set(link.post_id, {
      status: row.status,
      created_at: row.created_at,
      revisions_completed_at: link.revisions_completed_at,
    });
  }

  let pending = 0;
  for (const id of postIds) {
    const latest = latestByPost.get(id);
    if (!latest) {
      pending += 1;
      continue;
    }
    if (latest.status === 'approved') continue;
    const completedAt = latest.revisions_completed_at;
    if (!completedAt || new Date(latest.created_at) > new Date(completedAt)) {
      // changes_requested with no revision-complete marker → ours, not theirs
      continue;
    }
    pending += 1;
  }

  return { pending, total, hasRevisionFeedback };
}

/**
 * Auto-approve every still-pending post on the link by minting a synthetic
 * review link + an approved review comment authored by Cortex, then
 * flipping `draft` posts to `scheduled` so the publish cron can ship
 * them. Mirrors `force-approve` but in bulk and without an admin user.
 *
 * Returns true if at least one post got auto-approved.
 */
async function autoApprovePending(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    link: {
      id: string;
      drop_id: string;
      included_post_ids: string[];
      last_sent_at: string | null;
    };
    client: { id: string; name: string };
    shareUrl: string;
    pending: number;
    total: number;
  },
): Promise<boolean> {
  const { link, client } = args;

  // Re-derive which post ids are still pending (defensive: between
  // cadence checks and now an admin could have force-approved one).
  const { pending: stillPending } = await countPendingPosts(
    admin,
    link.included_post_ids,
  );
  if (stillPending === 0) {
    // Nothing to do, but stamp so we don't re-enter.
    await admin
      .from('content_drop_share_links')
      .update({ auto_approved_at: new Date().toISOString() })
      .eq('id', link.id);
    return false;
  }

  // Walk each post and mint approval rows for the ones still pending.
  type LatestRow = {
    status: 'approved' | 'changes_requested';
    created_at: string;
    post_review_links:
      | { post_id: string; revisions_completed_at: string | null }
      | { post_id: string; revisions_completed_at: string | null }[]
      | null;
  };
  const { data: latestRows } = await admin
    .from('post_review_comments')
    .select('status, created_at, post_review_links!inner(post_id, revisions_completed_at)')
    .in('status', ['approved', 'changes_requested'])
    .in('post_review_links.post_id', link.included_post_ids)
    .order('created_at', { ascending: false })
    .returns<LatestRow[]>();

  const latestByPost = new Map<string, LatestRow>();
  for (const row of latestRows ?? []) {
    const join = Array.isArray(row.post_review_links)
      ? row.post_review_links[0] ?? null
      : row.post_review_links;
    if (!join) continue;
    if (latestByPost.has(join.post_id)) continue;
    latestByPost.set(join.post_id, row);
  }

  const pendingPostIds: string[] = [];
  for (const postId of link.included_post_ids) {
    const latest = latestByPost.get(postId);
    if (!latest) {
      pendingPostIds.push(postId);
      continue;
    }
    if (latest.status === 'approved') continue;
    const join = Array.isArray(latest.post_review_links)
      ? latest.post_review_links[0] ?? null
      : latest.post_review_links;
    const completedAt = join?.revisions_completed_at ?? null;
    if (!completedAt || new Date(latest.created_at) > new Date(completedAt)) {
      // Ball is in our court, don't auto-approve over the top of an
      // unhandled change request.
      continue;
    }
    pendingPostIds.push(postId);
  }

  if (pendingPostIds.length === 0) {
    await admin
      .from('content_drop_share_links')
      .update({ auto_approved_at: new Date().toISOString() })
      .eq('id', link.id);
    return false;
  }

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const linkInserts = pendingPostIds.map((postId) => ({
    post_id: postId,
    expires_at: expiresAt,
  }));
  const { data: mintedLinks } = await admin
    .from('post_review_links')
    .insert(linkInserts)
    .select('id, post_id')
    .returns<Array<{ id: string; post_id: string }>>();

  if (!mintedLinks || mintedLinks.length === 0) {
    console.error('calendar-reminders: auto-approve failed to mint review links');
    return false;
  }

  const noteDate = new Date().toISOString().slice(0, 10);
  const commentInserts = mintedLinks.map((m) => ({
    review_link_id: m.id,
    author_name: 'Cortex auto-approve',
    content: `Auto-approved on ${noteDate} after no client activity for 9 days.`,
    status: 'approved' as const,
  }));
  await admin.from('post_review_comments').insert(commentInserts);

  await admin
    .from('scheduled_posts')
    .update({
      status: 'scheduled',
      failure_reason: null,
      retry_count: 0,
      updated_at: new Date().toISOString(),
    })
    .in('id', pendingPostIds)
    .eq('status', 'draft');

  // Stamp the link + claim the all-approved chat right atomically.
  const stampIso = new Date().toISOString();
  await admin
    .from('content_drop_share_links')
    .update({
      auto_approved_at: stampIso,
      last_followup_at: stampIso,
    })
    .eq('id', link.id);

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  postToGoogleChatSafe(
    opsWebhook,
    {
      text:
        `✅ *Internal:* cron auto-approved ${pendingPostIds.length} pending post(s) on *${client.name}*'s calendar after 9 days of zero client activity. ` +
        `Posts will publish on their scheduled times. The client was NOT emailed about the auto-approval, this is a Cortex policy fallback.\n${args.shareUrl}`,
    },
    `cadence_ops_auto_approve:${link.id}`,
  );

  await notifyAdmins({
    type: 'followup_sent',
    clientId: client.id,
    title: `Auto-approved ${pendingPostIds.length} posts on ${client.name}`,
    body: `No client activity for 9 days. Posts will publish on their scheduled times.`,
    linkPath: `/admin/calendar/${link.drop_id}`,
  });

  return true;
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-reminders' },
  handleGet,
);
