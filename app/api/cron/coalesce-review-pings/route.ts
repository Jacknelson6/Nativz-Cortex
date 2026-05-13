import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  buildChatCard,
  postToGoogleChatSafe,
  type ChatCardWidget,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { formatPostTimeForChat } from '@/lib/chat/format-post-time';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/coalesce-review-pings
 *
 * Batches client revision-request / comment pings into a single Google
 * Chat card per share-link. The insert paths (`/api/calendar/share/[token]/comment`,
 * `/api/editing/share/[token]/comment`) used to fire one card per comment
 * the instant it landed, so a client leaving five quick notes
 * ("change location 1, location 2, …") spammed five back-to-back cards.
 *
 * Flow:
 *   1. Insert leaves `chat_notified_at` NULL on each comment.
 *   2. This cron (every 5 min) groups un-notified `comment` /
 *      `changes_requested` rows per share-link.
 *   3. For each group, fire one card listing every comment in the batch
 *      **only after** the earliest pending comment is ≥20 min old. That
 *      gives the client time to finish their pass; subsequent notes in
 *      the same 20-min window collapse onto a single ping.
 *   4. Stamp `chat_notified_at = now()` on all included rows so they
 *      never re-fire. Comments arriving after the batch fires start a
 *      fresh window.
 *
 * Approved / all-approved / revisions-complete still fire immediately
 * from their insert paths — those are single-shot events, not spammy.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

const QUIET_WINDOW_MS = 20 * 60 * 1000;

type CalendarPending = {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'comment' | 'changes_requested';
  attachments: Array<{ url: string; filename: string }> | null;
  created_at: string;
  post_review_links: {
    post_id: string;
    scheduled_posts: {
      id: string;
      scheduled_at: string | null;
    } | null;
  } | null;
};

type EditingPending = {
  id: string;
  share_link_id: string;
  project_id: string;
  author_name: string;
  content: string;
  status: 'comment' | 'changes_requested';
  attachments: Array<{ url: string; filename: string }> | null;
  video_id: string | null;
  created_at: string;
};

function previewLine(c: {
  author_name: string;
  status: string;
  content: string;
  attachments: Array<{ url: string; filename: string }> | null;
}): string {
  const verb = c.status === 'changes_requested' ? 'requested changes' : 'commented';
  const trimmed = c.content.trim();
  const body = trimmed
    ? `"${trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed}"`
    : `(${(c.attachments ?? []).length} attachment${(c.attachments ?? []).length === 1 ? '' : 's'})`;
  return `• ${c.author_name} ${verb}: ${body}`;
}

async function handleCalendar(admin: ReturnType<typeof createAdminClient>): Promise<{
  cardsFired: number;
  commentsBatched: number;
}> {
  const { data: pending } = await admin
    .from('post_review_comments')
    .select(
      'id, review_link_id, author_name, content, status, attachments, created_at, post_review_links!inner(post_id, scheduled_posts!inner(id, scheduled_at))',
    )
    .is('chat_notified_at', null)
    .in('status', ['comment', 'changes_requested'])
    .order('created_at', { ascending: true });

  const rows = (pending ?? []) as unknown as CalendarPending[];
  if (rows.length === 0) return { cardsFired: 0, commentsBatched: 0 };

  // Reverse-lookup review_link_id → share_link via post_review_link_map.
  // scheduled_posts has no drop_id; the share link's JSONB map is the only
  // place that connects a review-link to its drop. We fetch every active
  // share link whose map contains at least one of the pending comments'
  // review_link_ids, then bucket comments by share_link_id.
  const pendingReviewLinkIds = Array.from(new Set(rows.map((r) => r.review_link_id)));
  const { data: shareLinks } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, token, name, post_review_link_map, created_at')
    .or(
      pendingReviewLinkIds
        .map((id) => `post_review_link_map.cs.{"_":"${id}"}`)
        .join(','),
    );
  // The `or().cs` JSONB-contains query above tries every review_link_id but
  // Supabase rejects unrecognized keys; fall back to fetching all recent
  // links and filtering in-memory if the targeted query returned nothing
  // useful (defensive — JSONB key-contains has been finicky).
  let candidateLinks = shareLinks ?? [];
  if (candidateLinks.length === 0) {
    const { data: fallback } = await admin
      .from('content_drop_share_links')
      .select('id, drop_id, token, name, post_review_link_map, created_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    candidateLinks = fallback ?? [];
  }

  // Build review_link_id → share_link (prefer newest if multiple match).
  const linkByReviewId = new Map<
    string,
    {
      id: string;
      drop_id: string;
      token: string;
      name: string | null;
      created_at: string | null;
    }
  >();
  for (const link of candidateLinks as Array<{
    id: string;
    drop_id: string;
    token: string;
    name: string | null;
    post_review_link_map: Record<string, string> | null;
    created_at: string | null;
  }>) {
    const map = link.post_review_link_map ?? {};
    for (const reviewLinkId of Object.values(map)) {
      const existing = linkByReviewId.get(reviewLinkId);
      const newer =
        !existing ||
        (link.created_at &&
          existing.created_at &&
          new Date(link.created_at).getTime() >
            new Date(existing.created_at).getTime());
      if (newer) {
        linkByReviewId.set(reviewLinkId, {
          id: link.id,
          drop_id: link.drop_id,
          token: link.token,
          name: link.name,
          created_at: link.created_at,
        });
      }
    }
  }

  // Group comments by share_link_id.
  const byShareLink = new Map<
    string,
    {
      shareLink: {
        id: string;
        drop_id: string;
        token: string;
        name: string | null;
      };
      comments: CalendarPending[];
    }
  >();
  for (const r of rows) {
    const link = linkByReviewId.get(r.review_link_id);
    if (!link) continue;
    const entry = byShareLink.get(link.id) ?? { shareLink: link, comments: [] };
    entry.comments.push(r);
    byShareLink.set(link.id, entry);
  }

  const now = Date.now();
  let cardsFired = 0;
  let commentsBatched = 0;

  for (const [, { shareLink, comments: group }] of byShareLink) {
    const earliest = new Date(group[0].created_at).getTime();
    if (now - earliest < QUIET_WINDOW_MS) continue; // not yet 20 min old

    const { data: drop } = await admin
      .from('content_drops')
      .select(
        'id, client_id, start_date, clients(name, agency, chat_webhook_url)',
      )
      .eq('id', shareLink.drop_id)
      .single<{
        id: string;
        client_id: string;
        start_date: string;
        clients: {
          name: string;
          agency: string | null;
          chat_webhook_url: string | null;
        } | null;
      }>();
    if (!drop) continue;

    const clientName = drop.clients?.name ?? 'Client';
    const webhookUrl = await resolveTeamChatWebhook(admin, {
      primaryUrl: drop.clients?.chat_webhook_url ?? null,
      agency: drop.clients?.agency ?? null,
    });
    if (!webhookUrl) continue;

    const setting = await getClientNotificationSetting(
      'calendar_comment_chat',
      'chat',
      drop.client_id,
    );
    if (!setting.enabled) continue;

    const appBase = getCortexAppUrl(getBrandFromAgency(drop.clients?.agency ?? null));
    const shareUrl = `${appBase}/s/${shareLink.token}`;

    // Bucket comments by post so the card reads "Post for X has N notes"
    // rather than a flat firehose.
    const byPost = new Map<string, CalendarPending[]>();
    for (const c of group) {
      const postId = c.post_review_links?.scheduled_posts?.id ?? 'unknown';
      const list = byPost.get(postId) ?? [];
      list.push(c);
      byPost.set(postId, list);
    }

    const widgets: ChatCardWidget[] = [];
    let isFirstSection = true;
    for (const [, perPost] of byPost) {
      const first = perPost[0];
      const scheduledAt = first.post_review_links?.scheduled_posts?.scheduled_at ?? null;
      const postTime = scheduledAt ? formatPostTimeForChat(scheduledAt) : null;
      if (!isFirstSection) widgets.push({ type: 'divider' });
      isFirstSection = false;
      if (postTime) {
        widgets.push({ type: 'kv', label: 'Post scheduled for', value: postTime });
      }
      widgets.push({
        type: 'text',
        text: perPost.map((c) => previewLine(c)).join('<br>'),
      });
    }
    widgets.push({
      type: 'button',
      text: 'Open & reply',
      url: shareUrl,
      filled: true,
    });

    const totalNotes = group.length;
    const headerTitle = `✏️ ${totalNotes} new note${totalNotes === 1 ? '' : 's'} on ${clientName}`;
    const headerSubtitle = shareLink.name?.trim() || 'Calendar share link';
    const fallback = [
      `${headerTitle} (${headerSubtitle})`,
      ...group.map((c) => previewLine(c)),
      shareUrl,
    ].join('\n');

    postToGoogleChatSafe(
      webhookUrl,
      buildChatCard({
        cardId: `calendar-comment-batch-${shareLink.id}-${earliest}`,
        headerTitle,
        headerSubtitle,
        sections: [{ widgets }],
        fallbackText: fallback,
      }),
      `coalesce-review-pings:calendar:${shareLink.id}`,
    );

    // Stamp dedup AFTER firing. If the stamp write fails we'd rather
    // double-send than lose visibility on the batch.
    const ids = group.map((c) => c.id);
    const { error: stampErr } = await admin
      .from('post_review_comments')
      .update({ chat_notified_at: new Date().toISOString() })
      .in('id', ids);
    if (stampErr) {
      console.error('coalesce-review-pings: calendar stamp failed', stampErr);
    }

    cardsFired += 1;
    commentsBatched += group.length;
  }

  return { cardsFired, commentsBatched };
}

async function handleEditing(admin: ReturnType<typeof createAdminClient>): Promise<{
  cardsFired: number;
  commentsBatched: number;
}> {
  const { data: pending } = await admin
    .from('editing_project_review_comments')
    .select(
      'id, share_link_id, project_id, author_name, content, status, attachments, video_id, created_at',
    )
    .is('chat_notified_at', null)
    .in('status', ['comment', 'changes_requested'])
    .order('created_at', { ascending: true });

  const rows = (pending ?? []) as unknown as EditingPending[];
  if (rows.length === 0) return { cardsFired: 0, commentsBatched: 0 };

  const byShareLink = new Map<string, EditingPending[]>();
  for (const r of rows) {
    if (!r.share_link_id) continue;
    const list = byShareLink.get(r.share_link_id) ?? [];
    list.push(r);
    byShareLink.set(r.share_link_id, list);
  }

  const now = Date.now();
  let cardsFired = 0;
  let commentsBatched = 0;

  for (const [shareLinkId, group] of byShareLink) {
    const earliest = new Date(group[0].created_at).getTime();
    if (now - earliest < QUIET_WINDOW_MS) continue;

    const { data: linkRow } = await admin
      .from('editing_project_share_links')
      .select(
        'id, token, project_id, editing_projects(id, name, client_id, clients(name, agency, chat_webhook_url))',
      )
      .eq('id', shareLinkId)
      .maybeSingle<{
        id: string;
        token: string;
        project_id: string;
        editing_projects: {
          id: string;
          name: string | null;
          client_id: string;
          clients: {
            name: string;
            agency: string | null;
            chat_webhook_url: string | null;
          } | null;
        } | null;
      }>();
    if (!linkRow?.editing_projects) continue;

    const project = linkRow.editing_projects;
    const clientId = project.client_id;
    const clientName = project.clients?.name ?? 'Client';
    const projectName = project.name?.trim() || 'Editing project';

    const webhookUrl = await resolveTeamChatWebhook(admin, {
      primaryUrl: project.clients?.chat_webhook_url ?? null,
      agency: project.clients?.agency ?? null,
    });
    if (!webhookUrl) continue;

    const setting = await getClientNotificationSetting(
      'editing_comment_chat',
      'chat',
      clientId,
    );
    if (!setting.enabled) continue;

    const appBase = getCortexAppUrl(getBrandFromAgency(project.clients?.agency ?? null));
    const shareUrl = `${appBase}/s/${linkRow.token}`;

    const widgets: ChatCardWidget[] = [
      {
        type: 'text',
        text: group.map((c) => previewLine(c)).join('<br>'),
      },
      {
        type: 'button',
        text: 'Open & reply',
        url: shareUrl,
        filled: true,
      },
    ];

    const totalNotes = group.length;
    const headerTitle = `✏️ ${totalNotes} new note${totalNotes === 1 ? '' : 's'} on ${clientName}`;
    const headerSubtitle = projectName;
    const fallback = [
      `${headerTitle} (${headerSubtitle})`,
      ...group.map((c) => previewLine(c)),
      shareUrl,
    ].join('\n');

    postToGoogleChatSafe(
      webhookUrl,
      buildChatCard({
        cardId: `editing-comment-batch-${shareLinkId}-${earliest}`,
        headerTitle,
        headerSubtitle,
        sections: [{ widgets }],
        fallbackText: fallback,
      }),
      `coalesce-review-pings:editing:${shareLinkId}`,
    );

    const ids = group.map((c) => c.id);
    const { error: stampErr } = await admin
      .from('editing_project_review_comments')
      .update({ chat_notified_at: new Date().toISOString() })
      .in('id', ids);
    if (stampErr) {
      console.error('coalesce-review-pings: editing stamp failed', stampErr);
    }

    cardsFired += 1;
    commentsBatched += group.length;
  }

  return { cardsFired, commentsBatched };
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const [calendar, editing] = await Promise.all([
    handleCalendar(admin),
    handleEditing(admin),
  ]);

  return NextResponse.json({
    calendar_cards: calendar.cardsFired,
    calendar_comments: calendar.commentsBatched,
    editing_cards: editing.cardsFired,
    editing_comments: editing.commentsBatched,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/coalesce-review-pings',
    extractRowsProcessed: (body) => {
      const b = body as {
        calendar_comments?: number;
        editing_comments?: number;
      } | null;
      if (!b) return undefined;
      return (b.calendar_comments ?? 0) + (b.editing_comments ?? 0);
    },
  },
  handleGet,
);
