import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendCalendarCommentDigestEmail,
  type CalendarDigestClientGroup,
  type CalendarDigestComment,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

const DIGEST_RECIPIENT = 'jack@nativz.io';

type CommentRow = {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment';
  created_at: string;
  post_review_links: {
    post_id: string;
    scheduled_posts: {
      id: string;
      caption: string | null;
      client_id: string;
      clients: { id: string; name: string } | null;
    } | null;
  } | null;
};

/**
 * GET /api/cron/calendar-comment-digest
 *
 * Daily digest of last 24h of post_review_comments, grouped by client, emailed
 * to Jack at 8 AM CT (13:00 UTC during CDT). Real-time per-comment notifications
 * happen via Google Chat (handled in the share-link comment route); this digest
 * is the email summary so nothing is missed.
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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: comments, error } = await admin
    .from('post_review_comments')
    .select(`
      id,
      review_link_id,
      author_name,
      content,
      status,
      created_at,
      post_review_links!inner (
        post_id,
        scheduled_posts!inner (
          id,
          caption,
          client_id,
          clients!inner ( id, name )
        )
      )
    `)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .returns<CommentRow[]>();

  if (error) {
    console.error('calendar-comment-digest: query failed:', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  if (!comments || comments.length === 0) {
    return NextResponse.json({ message: 'no comments in window', sent: 0 });
  }

  // Map post_id → drop_id via the most recent share link that includes it,
  // so each client section can deep-link to the right calendar.
  const postIds = Array.from(
    new Set(
      comments
        .map((c) => c.post_review_links?.scheduled_posts?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const postIdToDropId: Record<string, string> = {};
  if (postIds.length > 0) {
    const { data: shareLinks } = await admin
      .from('content_drop_share_links')
      .select('drop_id, included_post_ids, created_at')
      .overlaps('included_post_ids', postIds)
      .order('created_at', { ascending: false })
      .returns<{ drop_id: string; included_post_ids: string[]; created_at: string }[]>();
    for (const sl of shareLinks ?? []) {
      for (const pid of sl.included_post_ids ?? []) {
        if (postIds.includes(pid) && !postIdToDropId[pid]) postIdToDropId[pid] = sl.drop_id;
      }
    }
  }

  // Group by client_id.
  const byClient = new Map<string, { clientName: string; dropId: string | null; comments: CalendarDigestComment[] }>();
  for (const c of comments) {
    const sp = c.post_review_links?.scheduled_posts;
    const client = sp?.clients;
    if (!sp || !client) continue;
    const captionPreview = (sp.caption ?? '').slice(0, 80) + ((sp.caption ?? '').length > 80 ? '…' : '');
    const contentPreview = c.content.slice(0, 200) + (c.content.length > 200 ? '…' : '');
    const entry = byClient.get(client.id) ?? {
      clientName: client.name,
      dropId: postIdToDropId[sp.id] ?? null,
      comments: [],
    };
    if (!entry.dropId && postIdToDropId[sp.id]) entry.dropId = postIdToDropId[sp.id];
    entry.comments.push({
      authorName: c.author_name,
      status: c.status,
      contentPreview,
      captionPreview,
      createdAt: c.created_at,
    });
    byClient.set(client.id, entry);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const groups: CalendarDigestClientGroup[] = Array.from(byClient.values()).map((g) => ({
    clientName: g.clientName,
    dropUrl: g.dropId ? `${appUrl}/admin/calendar/${g.dropId}` : `${appUrl}/admin/calendar`,
    comments: g.comments,
  }));

  // Window label: "Apr 27 → Apr 28" (sender's local — fine for an internal digest)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const windowLabel = `${fmt(yesterday)} → ${fmt(now)}`;

  try {
    await sendCalendarCommentDigestEmail({
      to: DIGEST_RECIPIENT,
      groups,
      windowLabel,
    });
  } catch (sendErr) {
    console.error('calendar-comment-digest: send failed:', sendErr);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }

  return NextResponse.json({
    message: `digest sent to ${DIGEST_RECIPIENT}`,
    sent: 1,
    totalComments: comments.length,
    clients: groups.length,
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-comment-digest' },
  handleGet,
);
