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
import { notifyAdmins } from '@/lib/notifications';

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
 *   2. This cron (every 5 min) groups un-notified `comment` rows per
 *      share-link. On the editing side it
 *      also batches `approved` (client rapid-fire approvals) and
 *      `video_revised` (editor re-upload audit rows from
 *      `/api/admin/editing/projects/:id/videos`).
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

/**
 * Stale comments older than this are excluded from new chat pings. The
 * insert paths leave `chat_notified_at = NULL` on every comment; if the
 * notification was previously skipped (no webhook, setting disabled,
 * client deleted, etc.) the row sits NULL forever and would otherwise
 * resurrect into a fresh batch the moment the skip condition flips. This
 * cap stops "all comments since the dawn of time" cards (the bug Jack
 * flagged on 2026-05-13 — a single card listed 5 weeks-old comments).
 */
const STALE_CUTOFF_HOURS = 6;

function staleCutoffIso(): string {
  return new Date(Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000).toISOString();
}

type CalendarPending = {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'comment';
  attachments: Array<{ url: string; filename: string }> | null;
  parent_comment_id: string | null;
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
  status: 'comment' | 'approved' | 'video_revised';
  attachments: Array<{ url: string; filename: string }> | null;
  video_id: string | null;
  created_at: string;
};

function previewLine(c: {
  author_name: string;
  status: string;
  content: string;
  attachments: Array<{ url: string; filename: string }> | null;
  parent_comment_id?: string | null;
}): string {
  // Reply rows are always status='comment' (the API forces it), but we want
  // the per-line verb to read "replied" so the team can tell the difference
  // between a fresh comment and someone responding to an existing thread.
  const isReply = !!c.parent_comment_id;
  const verb = isReply
    ? 'replied'
    : c.status === 'approved'
      ? 'approved'
      : c.status === 'video_revised'
        ? 're-uploaded a revised cut'
        : 'commented';
  const trimmed = c.content.trim();
  const attachmentCount = (c.attachments ?? []).length;
  const fallback =
    attachmentCount > 0
      ? `(${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'})`
      : c.status === 'approved' || c.status === 'video_revised'
        ? '(no notes)'
        : '(no message)';
  const body = trimmed
    ? `"${trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed}"`
    : fallback;
  return `• ${c.author_name} ${verb}: ${body}`;
}

async function handleCalendar(admin: ReturnType<typeof createAdminClient>): Promise<{
  cardsFired: number;
  commentsBatched: number;
}> {
  const cutoff = staleCutoffIso();
  const { data: pending } = await admin
    .from('post_review_comments')
    .select(
      'id, review_link_id, author_name, content, status, attachments, parent_comment_id, created_at, post_review_links!inner(post_id, scheduled_posts!inner(id, scheduled_at))',
    )
    .is('chat_notified_at', null)
    .in('status', ['comment'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  // Backstop sweep: stamp any pre-cutoff rows so they can never bundle
  // into a future ping. Without this, comments left while the webhook
  // was unconfigured (or the setting was off) would resurrect the
  // moment that config flipped.
  const { error: sweepErr } = await admin
    .from('post_review_comments')
    .update({ chat_notified_at: new Date().toISOString() })
    .is('chat_notified_at', null)
    .in('status', ['comment'])
    .lt('created_at', cutoff);
  if (sweepErr) {
    console.error('coalesce-review-pings: calendar stale-sweep failed', sweepErr);
  }

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
    const allReplies = group.every((c) => !!c.parent_comment_id);
    let headerEmoji = '💬';
    let headerNoun = `new comment${totalNotes === 1 ? '' : 's'}`;
    if (allReplies) {
      headerEmoji = '↩️';
      headerNoun = `repl${totalNotes === 1 ? 'y' : 'ies'}`;
    }
    const headerTitle = `${headerEmoji} ${totalNotes} ${headerNoun} on ${clientName}`;
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
  const cutoff = staleCutoffIso();
  // `approved` joined this bundler on 2026-05-13. A client rapid-fire
  // approving five cuts in a row used to fire five separate "✅ approved"
  // cards back-to-back (Camila on Bit Bunker · May Ad Creatives). The
  // editing comment route now leaves approval rows with chat_notified_at
  // NULL exactly like comments + change requests, and this cron coalesces
  // the lot. The 🎉 all-approved single-shot still fires from the comment
  // route the moment the project hits 100% approved.
  //
  // `video_revised` joined the bundler on the same day. The admin videos
  // POST writes a `video_revised` audit row whenever the editor uploads
  // a `replace_video_id` retry, and this cron batches them into a 📬
  // "N revised cuts on <client>" team ping. Mirrors the calendar
  // /notify-revisions chat card without needing an explicit "Notify"
  // button: editing share links don't have a batch email flow.
  const PENDING_STATUSES = [
    'comment',
    'approved',
    'video_revised',
  ];
  const { data: pending } = await admin
    .from('editing_project_review_comments')
    .select(
      'id, share_link_id, project_id, author_name, content, status, attachments, video_id, created_at',
    )
    .is('chat_notified_at', null)
    .in('status', PENDING_STATUSES)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  // Backstop sweep — see calendar handler comment.
  const { error: sweepErr } = await admin
    .from('editing_project_review_comments')
    .update({ chat_notified_at: new Date().toISOString() })
    .is('chat_notified_at', null)
    .in('status', PENDING_STATUSES)
    .lt('created_at', cutoff);
  if (sweepErr) {
    console.error('coalesce-review-pings: editing stale-sweep failed', sweepErr);
  }

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

    // Match the calendar bundler shape: bucket comments by video so each
    // card section reads "Cut N · <title>" with that cut's notes under it.
    // Comments with no video_id (project-level notes) collapse into a
    // single "Project notes" section at the top.
    const videoIds = Array.from(
      new Set(group.map((c) => c.video_id).filter((v): v is string => !!v)),
    );
    const videoMetaById = new Map<
      string,
      { position: number | null; title: string | null; filename: string | null }
    >();
    if (videoIds.length > 0) {
      const { data: videoRows } = await admin
        .from('editing_project_videos')
        .select('id, position, title, filename')
        .in('id', videoIds);
      for (const v of (videoRows ?? []) as Array<{
        id: string;
        position: number | null;
        title: string | null;
        filename: string | null;
      }>) {
        videoMetaById.set(v.id, {
          position: v.position,
          title: v.title,
          filename: v.filename,
        });
      }
    }

    // Group by video_id, preserving "project-level" bucket for null video_id.
    const PROJECT_LEVEL = '__project__';
    const byVideo = new Map<string, EditingPending[]>();
    for (const c of group) {
      const key = c.video_id ?? PROJECT_LEVEL;
      const list = byVideo.get(key) ?? [];
      list.push(c);
      byVideo.set(key, list);
    }

    // Stable order: project-level first, then videos by position ascending
    // (matching how clients see the cuts on the share-link page).
    const orderedKeys = Array.from(byVideo.keys()).sort((a, b) => {
      if (a === PROJECT_LEVEL) return -1;
      if (b === PROJECT_LEVEL) return 1;
      const pa = videoMetaById.get(a)?.position ?? Number.MAX_SAFE_INTEGER;
      const pb = videoMetaById.get(b)?.position ?? Number.MAX_SAFE_INTEGER;
      return pa - pb;
    });

    function cutLabel(videoId: string): string {
      const meta = videoMetaById.get(videoId);
      const title = meta?.title?.trim() || meta?.filename?.trim() || 'Cut';
      const position = meta?.position;
      return position != null ? `Cut ${position + 1} · ${title}` : title;
    }

    const widgets: ChatCardWidget[] = [];
    let isFirstSection = true;
    for (const key of orderedKeys) {
      const perGroup = byVideo.get(key) ?? [];
      if (!isFirstSection) widgets.push({ type: 'divider' });
      isFirstSection = false;
      if (key === PROJECT_LEVEL) {
        widgets.push({ type: 'kv', label: 'Note on', value: 'Project' });
      } else {
        widgets.push({ type: 'kv', label: 'Cut', value: cutLabel(key) });
      }
      widgets.push({
        type: 'text',
        text: perGroup.map((c) => previewLine(c)).join('<br>'),
      });
    }
    // Header + CTA pick a flavour based on batch composition:
    //   pure approvals       → ✅ "N approvals", "Open share link"
    //   pure revised cuts    → 📬 "N revised cuts sent", "Spot-check share link"
    //   anything else (mixed,
    //   change requests,
    //   plain comments)      → ✏️ "N updates", "Open & reply"
    // Mixed batches stay on ✏️ on purpose: we don't want a change request
    // hidden inside an approval/revision run to read like a celebration.
    const approvalsOnly = group.every((c) => c.status === 'approved');
    const revisionsOnly = group.every((c) => c.status === 'video_revised');
    let headerEmoji = '✏️';
    let headerNoun = `update${group.length === 1 ? '' : 's'}`;
    let ctaText = 'Open & reply';
    if (approvalsOnly) {
      headerEmoji = '✅';
      headerNoun = `approval${group.length === 1 ? '' : 's'}`;
      ctaText = 'Open share link';
    } else if (revisionsOnly) {
      headerEmoji = '📬';
      headerNoun = `revised cut${group.length === 1 ? '' : 's'} sent`;
      ctaText = 'Spot-check share link';
    }
    widgets.push({
      type: 'button',
      text: ctaText,
      url: shareUrl,
      filled: true,
    });

    const totalNotes = group.length;
    const headerTitle = `${headerEmoji} ${totalNotes} ${headerNoun} on ${clientName}`;
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

/**
 * Bell-coalesce passes. Mirrors the chat coalesce above but drains the
 * separate `bell_notified_at` column and fires in-app notifications to
 * the team via `notifyAdmins` (scoped to assigned members + owners).
 *
 * Why a separate column from `chat_notified_at`: chat and bell are
 * independently configurable per-client (one webhook can be set without
 * the other, one preference can be off without the other), and we don't
 * want a chat-skip to also silently swallow the bell ping or vice versa.
 * Migration 322 added the column.
 *
 * Filter: only client-side activity (`author_role != 'admin'`) status =
 * 'comment'. Admin-authored rows don't ping the admin team's bells
 * (we already know we commented), and approvals are already covered
 * by the synchronous 🎉 all-approved single-shot. `video_revised` rows
 * are written by editors (admin role) so they're also excluded.
 */
async function handleCalendarBells(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ batchesFired: number; commentsBatched: number }> {
  const cutoff = staleCutoffIso();
  const { data: pending } = await admin
    .from('post_review_comments')
    .select(
      'id, review_link_id, author_role, author_name, content, status, created_at',
    )
    .is('bell_notified_at', null)
    .eq('status', 'comment')
    .neq('author_role', 'admin')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  const { error: sweepErr } = await admin
    .from('post_review_comments')
    .update({ bell_notified_at: new Date().toISOString() })
    .is('bell_notified_at', null)
    .eq('status', 'comment')
    .neq('author_role', 'admin')
    .lt('created_at', cutoff);
  if (sweepErr) {
    console.error('coalesce-review-pings: calendar bell stale-sweep failed', sweepErr);
  }

  const rows = (pending ?? []) as Array<{
    id: string;
    review_link_id: string;
    author_role: 'viewer' | 'guest';
    author_name: string;
    content: string;
    status: 'comment';
    created_at: string;
  }>;
  if (rows.length === 0) return { batchesFired: 0, commentsBatched: 0 };

  const pendingReviewLinkIds = Array.from(new Set(rows.map((r) => r.review_link_id)));
  const { data: candidateLinks } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, token, name, post_review_link_map, created_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  const linkByReviewId = new Map<
    string,
    { id: string; drop_id: string; token: string; name: string | null; created_at: string | null }
  >();
  for (const link of (candidateLinks ?? []) as Array<{
    id: string;
    drop_id: string;
    token: string;
    name: string | null;
    post_review_link_map: Record<string, string> | null;
    created_at: string | null;
  }>) {
    const map = link.post_review_link_map ?? {};
    for (const reviewLinkId of Object.values(map)) {
      if (!pendingReviewLinkIds.includes(reviewLinkId)) continue;
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

  const byShareLink = new Map<
    string,
    {
      shareLink: { id: string; drop_id: string; token: string; name: string | null };
      comments: typeof rows;
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
  let batchesFired = 0;
  let commentsBatched = 0;

  for (const [, { shareLink, comments: group }] of byShareLink) {
    const earliest = new Date(group[0].created_at).getTime();
    if (now - earliest < QUIET_WINDOW_MS) continue;

    const { data: drop } = await admin
      .from('content_drops')
      .select('id, client_id, clients(name)')
      .eq('id', shareLink.drop_id)
      .single<{ id: string; client_id: string; clients: { name: string } | null }>();
    if (!drop) continue;

    const clientName = drop.clients?.name ?? 'Client';
    const totalNotes = group.length;
    const authors = Array.from(new Set(group.map((c) => c.author_name))).filter(Boolean);
    const authorsLabel =
      authors.length === 0
        ? 'A client viewer'
        : authors.length === 1
          ? authors[0]
          : authors.length === 2
            ? `${authors[0]} and ${authors[1]}`
            : `${authors[0]} and ${authors.length - 1} others`;
    const title = `${totalNotes} new comment${totalNotes === 1 ? '' : 's'} on ${clientName}`;
    const linkLabel = shareLink.name?.trim() || 'calendar share link';
    const body = `${authorsLabel} left feedback on the ${linkLabel}. Open to review.`;

    try {
      await notifyAdmins({
        type: 'share_comment_batch',
        title,
        body,
        linkPath: `/admin/calendar/${shareLink.drop_id}`,
        clientId: drop.client_id,
      });
    } catch (err) {
      console.error('coalesce-review-pings: calendar bell fan-out failed', err);
      continue;
    }

    const ids = group.map((c) => c.id);
    const { error: stampErr } = await admin
      .from('post_review_comments')
      .update({ bell_notified_at: new Date().toISOString() })
      .in('id', ids);
    if (stampErr) {
      console.error('coalesce-review-pings: calendar bell stamp failed', stampErr);
    }

    batchesFired += 1;
    commentsBatched += group.length;
  }

  return { batchesFired, commentsBatched };
}

async function handleEditingBells(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ batchesFired: number; commentsBatched: number }> {
  const cutoff = staleCutoffIso();
  const { data: pending } = await admin
    .from('editing_project_review_comments')
    .select(
      'id, share_link_id, project_id, author_role, author_name, content, status, created_at',
    )
    .is('bell_notified_at', null)
    .eq('status', 'comment')
    .neq('author_role', 'admin')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  const { error: sweepErr } = await admin
    .from('editing_project_review_comments')
    .update({ bell_notified_at: new Date().toISOString() })
    .is('bell_notified_at', null)
    .eq('status', 'comment')
    .neq('author_role', 'admin')
    .lt('created_at', cutoff);
  if (sweepErr) {
    console.error('coalesce-review-pings: editing bell stale-sweep failed', sweepErr);
  }

  const rows = (pending ?? []) as Array<{
    id: string;
    share_link_id: string | null;
    project_id: string;
    author_role: 'viewer' | 'guest';
    author_name: string;
    content: string;
    status: 'comment';
    created_at: string;
  }>;
  if (rows.length === 0) return { batchesFired: 0, commentsBatched: 0 };

  const byShareLink = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.share_link_id) continue;
    const list = byShareLink.get(r.share_link_id) ?? [];
    list.push(r);
    byShareLink.set(r.share_link_id, list);
  }

  const now = Date.now();
  let batchesFired = 0;
  let commentsBatched = 0;

  for (const [shareLinkId, group] of byShareLink) {
    const earliest = new Date(group[0].created_at).getTime();
    if (now - earliest < QUIET_WINDOW_MS) continue;

    const { data: linkRow } = await admin
      .from('editing_project_share_links')
      .select(
        'id, project_id, editing_projects(id, name, client_id, clients(name))',
      )
      .eq('id', shareLinkId)
      .maybeSingle<{
        id: string;
        project_id: string;
        editing_projects: {
          id: string;
          name: string | null;
          client_id: string;
          clients: { name: string } | null;
        } | null;
      }>();
    if (!linkRow?.editing_projects) continue;

    const project = linkRow.editing_projects;
    const clientName = project.clients?.name ?? 'Client';
    const projectName = project.name?.trim() || 'Editing project';
    const totalNotes = group.length;
    const authors = Array.from(new Set(group.map((c) => c.author_name))).filter(Boolean);
    const authorsLabel =
      authors.length === 0
        ? 'A client viewer'
        : authors.length === 1
          ? authors[0]
          : authors.length === 2
            ? `${authors[0]} and ${authors[1]}`
            : `${authors[0]} and ${authors.length - 1} others`;
    const title = `${totalNotes} new comment${totalNotes === 1 ? '' : 's'} on ${clientName}`;
    const body = `${authorsLabel} left feedback on ${projectName}. Open to review.`;

    try {
      await notifyAdmins({
        type: 'share_comment_batch',
        title,
        body,
        linkPath: `/admin/editing/projects/${project.id}`,
        clientId: project.client_id,
      });
    } catch (err) {
      console.error('coalesce-review-pings: editing bell fan-out failed', err);
      continue;
    }

    const ids = group.map((c) => c.id);
    const { error: stampErr } = await admin
      .from('editing_project_review_comments')
      .update({ bell_notified_at: new Date().toISOString() })
      .in('id', ids);
    if (stampErr) {
      console.error('coalesce-review-pings: editing bell stamp failed', stampErr);
    }

    batchesFired += 1;
    commentsBatched += group.length;
  }

  return { batchesFired, commentsBatched };
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const [calendar, editing, calendarBells, editingBells] = await Promise.all([
    handleCalendar(admin),
    handleEditing(admin),
    handleCalendarBells(admin),
    handleEditingBells(admin),
  ]);

  return NextResponse.json({
    calendar_cards: calendar.cardsFired,
    calendar_comments: calendar.commentsBatched,
    editing_cards: editing.cardsFired,
    editing_comments: editing.commentsBatched,
    calendar_bell_batches: calendarBells.batchesFired,
    calendar_bell_comments: calendarBells.commentsBatched,
    editing_bell_batches: editingBells.batchesFired,
    editing_bell_comments: editingBells.commentsBatched,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/coalesce-review-pings',
    extractRowsProcessed: (body) => {
      const b = body as {
        calendar_comments?: number;
        editing_comments?: number;
        calendar_bell_comments?: number;
        editing_bell_comments?: number;
      } | null;
      if (!b) return undefined;
      return (
        (b.calendar_comments ?? 0) +
        (b.editing_comments ?? 0) +
        (b.calendar_bell_comments ?? 0) +
        (b.editing_bell_comments ?? 0)
      );
    },
  },
  handleGet,
);
