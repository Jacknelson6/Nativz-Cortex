import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendCalendarCadenceFollowupEmail,
  type CadenceStage,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getNotificationSetting } from '@/lib/notifications/get-setting';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
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

  // `calendar_auto_approve` setting is preserved as a kill-switch for the
  // T+216h escalation step. The behavior changed 2026-05-13: instead of
  // auto-approving pending posts, we ping OPS to do a manual followup.
  // Unapproved posts MUST NEVER publish.
  const [cadenceSetting, escalationSetting] = await Promise.all([
    getNotificationSetting('calendar_followup_cadence'),
    getNotificationSetting('calendar_auto_approve'),
  ]);

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
  const counts = { stage1: 0, stage2: 0, stage3: 0, manualFollowupPinged: 0, skipped: 0 };

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

    // T+216h escalation: ladder is exhausted. Used to auto-approve, but
    // unapproved posts must never publish (CLAUDE.md hard invariant).
    // We now ping OPS once with a manual-followup card and stamp
    // `auto_approved_at` as the dedup marker (column kept for backcompat —
    // semantics is "escalation exhausted, ops notified").
    if (ageHours >= 216 && escalationSetting.enabled) {
      const pinged = await escalateToManualFollowup(admin, {
        link,
        client,
        shareUrl,
        pending,
        total,
      });
      if (pinged) counts.manualFollowupPinged += 1;
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

      // "Stage sent" chat card removed 2026-05-13 — Jack killed the
      // per-send ops ping. We still emit an in-app Cortex notification
      // (scoped to members assigned to this client + owners), and a
      // manual-followup OPS chat card fires once when the escalation
      // ladder taps out below.
      const stageLabel = stage === 3 ? 'Final call' : `Follow-up ${stage}`;
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
 * status approved / comment, joined through `post_review_links`.
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
    .in('status', ['approved', 'comment'])
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
    status: 'approved' | 'comment';
    post_review_links:
      | { post_id: string }
      | { post_id: string }[]
      | null;
  };
  const { data } = await admin
    .from('post_review_comments')
    .select('created_at, status, post_review_links!inner(post_id)')
    .in('status', ['approved', 'comment'])
    .in('post_review_links.post_id', postIds)
    .order('created_at', { ascending: false })
    .returns<Row[]>();

  const latestByPost = new Map<string, 'approved' | 'comment'>();
  let hasRevisionFeedback = false;
  for (const row of data ?? []) {
    const link = Array.isArray(row.post_review_links)
      ? row.post_review_links[0] ?? null
      : row.post_review_links;
    if (!link) continue;
    if (row.status === 'comment') hasRevisionFeedback = true;
    if (latestByPost.has(link.post_id)) continue;
    latestByPost.set(link.post_id, row.status);
  }

  let pending = 0;
  for (const id of postIds) {
    const latest = latestByPost.get(id);
    if (!latest || latest === 'comment') {
      pending += 1;
    }
  }

  return { pending, total, hasRevisionFeedback };
}

/**
 * Escalation ladder is exhausted (T+216h, no activity, three nudges sent).
 * Pings OPS chat once with a "manual followup needed" card and stamps the
 * share link so we never re-enter for it. Posts stay in their current
 * status — auto-approve was killed 2026-05-13 because the hard rule is
 * "unapproved drop posts MUST NEVER publish."
 */
async function escalateToManualFollowup(
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
  const { link, client, shareUrl, pending, total } = args;

  // Re-derive pending count (defensive: between checks an admin could
  // have force-approved or change-requested).
  const { pending: stillPending } = await countPendingPosts(
    admin,
    link.included_post_ids,
  );
  const stampIso = new Date().toISOString();
  await admin
    .from('content_drop_share_links')
    .update({ auto_approved_at: stampIso, last_followup_at: stampIso })
    .eq('id', link.id);

  if (stillPending === 0) return false;

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  postToGoogleChatSafe(
    opsWebhook,
    buildChatCardMessage({
      cardId: `cadence-manual-followup-${link.id}`,
      title: `📞 Manual followup needed`,
      subtitle: client.name,
      paragraphs: [
        `${stillPending} of ${total} posts still pending review after 9 days, three automated nudges sent.`,
        `Posts will NOT publish until ${client.name} approves. Reach out directly.`,
      ],
      buttons: [{ text: 'Open share link', url: shareUrl }],
      fallback: `📞 Manual followup needed on *${client.name}*, ${stillPending}/${total} posts still pending after 9 days + 3 nudges. ${shareUrl}`,
    }),
    `cadence_manual_followup:${link.id}`,
  );

  await notifyAdmins({
    type: 'followup_sent',
    clientId: client.id,
    title: `Manual followup needed on ${client.name}`,
    body: `${stillPending} of ${total} posts still pending after 3 automated nudges. Posts will not publish until approved.`,
    linkPath: `/admin/calendar/${link.drop_id}`,
  });

  // Suppress unused-var warning for `pending` (kept in args for parity
  // with autoApprovePending's signature and any future call sites).
  void pending;

  return true;
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-reminders' },
  handleGet,
);
