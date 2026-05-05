import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendCalendarCommentDigestEmail,
  type CalendarDigestClientGroup,
  type CalendarDigestComment,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getNotificationSetting } from '@/lib/notifications/get-setting';

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

type EditingCommentRow = {
  id: string;
  share_link_id: string | null;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment' | 'video_revised';
  created_at: string;
  project_id: string;
  editing_projects: {
    id: string;
    name: string | null;
    client_id: string;
    clients: { id: string; name: string } | null;
  } | null;
  editing_project_videos: { id: string; filename: string | null } | null;
};

/**
 * GET /api/cron/calendar-comment-digest
 *
 * Daily digest of last 24h of reviewer activity across BOTH surfaces
 * (calendar `post_review_comments` + editing
 * `editing_project_review_comments`), grouped by client × surface,
 * emailed to Jack at 8 AM CT (13:00 UTC during CDT). Real-time
 * per-comment notifications happen via Google Chat (handled in the
 * respective share-link comment routes); this digest is the email
 * summary so nothing is missed.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const setting = await getNotificationSetting('calendar_comment_digest');
  if (!setting.enabled) {
    return NextResponse.json({ message: 'notification disabled', sent: 0 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [calendarRes, editingRes] = await Promise.all([
    admin
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
      .returns<CommentRow[]>(),
    admin
      .from('editing_project_review_comments')
      .select(`
        id,
        share_link_id,
        author_name,
        content,
        status,
        created_at,
        project_id,
        editing_projects!inner (
          id,
          name,
          client_id,
          clients!inner ( id, name )
        ),
        editing_project_videos ( id, filename )
      `)
      .gte('created_at', since)
      .in('status', ['approved', 'changes_requested', 'comment'])
      .order('created_at', { ascending: true })
      .returns<EditingCommentRow[]>(),
  ]);

  if (calendarRes.error) {
    console.error('calendar-comment-digest: calendar query failed:', calendarRes.error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  if (editingRes.error) {
    console.error('calendar-comment-digest: editing query failed:', editingRes.error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const comments = calendarRes.data ?? [];
  const editingComments = editingRes.data ?? [];
  if (comments.length === 0 && editingComments.length === 0) {
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

  const postIdToShareToken: Record<string, string> = {};
  const postIdToDropId: Record<string, string> = {};
  if (postIds.length > 0) {
    const { data: shareLinks } = await admin
      .from('content_drop_share_links')
      .select('drop_id, token, included_post_ids, created_at')
      .overlaps('included_post_ids', postIds)
      .order('created_at', { ascending: false })
      .returns<{ drop_id: string; token: string; included_post_ids: string[]; created_at: string }[]>();
    for (const sl of shareLinks ?? []) {
      for (const pid of sl.included_post_ids ?? []) {
        if (postIds.includes(pid) && !postIdToShareToken[pid]) {
          postIdToShareToken[pid] = sl.token;
          postIdToDropId[pid] = sl.drop_id;
        }
      }
    }
  }

  // Group calendar comments by client_id.
  const byClient = new Map<string, { clientName: string; shareToken: string | null; dropId: string | null; comments: CalendarDigestComment[] }>();
  for (const c of comments) {
    const sp = c.post_review_links?.scheduled_posts;
    const client = sp?.clients;
    if (!sp || !client) continue;
    const captionPreview = (sp.caption ?? '').slice(0, 80) + ((sp.caption ?? '').length > 80 ? '…' : '');
    const contentPreview = c.content.slice(0, 200) + (c.content.length > 200 ? '…' : '');
    const entry = byClient.get(client.id) ?? {
      clientName: client.name,
      shareToken: postIdToShareToken[sp.id] ?? null,
      dropId: postIdToDropId[sp.id] ?? null,
      comments: [],
    };
    if (!entry.shareToken && postIdToShareToken[sp.id]) entry.shareToken = postIdToShareToken[sp.id];
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
  // Prefer the share-link URL so the digest works on phones (admin routes are
  // mobile-blocked). Fall back to the admin calendar if no share link exists.
  const groups: CalendarDigestClientGroup[] = Array.from(byClient.values()).map((g) => ({
    clientName: g.clientName,
    dropUrl: g.shareToken
      ? `${appUrl}/s/${g.shareToken}`
      : g.dropId
        ? `${appUrl}/admin/calendar/${g.dropId}`
        : `${appUrl}/admin/calendar`,
    comments: g.comments,
  }));

  // Editing-side grouping: one section per project so each CTA opens the
  // right cut. Resolve the most-recent live share link per project so the
  // section deep-links into the mobile-friendly review URL.
  const projectIds = Array.from(
    new Set(
      editingComments
        .map((c) => c.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const projectIdToShareToken: Record<string, string> = {};
  if (projectIds.length > 0) {
    const { data: editingShareLinks } = await admin
      .from('editing_project_share_links')
      .select('project_id, token, archived_at, created_at')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .returns<{ project_id: string; token: string; archived_at: string | null; created_at: string }[]>();
    for (const sl of editingShareLinks ?? []) {
      if (!projectIdToShareToken[sl.project_id]) {
        projectIdToShareToken[sl.project_id] = sl.token;
      }
    }
  }

  // Group editing comments by project (keyed project_id), each section gets
  // its own CTA pointing at that project's share link.
  const byProject = new Map<string, { clientName: string; projectName: string; projectId: string; comments: CalendarDigestComment[] }>();
  for (const c of editingComments) {
    const proj = c.editing_projects;
    const client = proj?.clients;
    if (!proj || !client) continue;
    const projectName = proj.name?.trim() || `${client.name} edit`;
    const filename = c.editing_project_videos?.filename ?? null;
    const captionPreview = filename
      ? filename.slice(0, 80) + (filename.length > 80 ? '…' : '')
      : 'Project-level note';
    const contentPreview = c.content.slice(0, 200) + (c.content.length > 200 ? '…' : '');
    // Fold the editing-only `video_revised` status into a plain comment for
    // digest presentation (it shouldn't reach here thanks to the .in() filter,
    // but the type union allows it so collapse defensively).
    const status: CalendarDigestComment['status'] =
      c.status === 'video_revised' ? 'comment' : c.status;
    const entry = byProject.get(proj.id) ?? {
      clientName: client.name,
      projectName,
      projectId: proj.id,
      comments: [],
    };
    entry.comments.push({
      authorName: c.author_name,
      status,
      contentPreview,
      captionPreview,
      createdAt: c.created_at,
    });
    byProject.set(proj.id, entry);
  }

  for (const g of byProject.values()) {
    const token = projectIdToShareToken[g.projectId];
    groups.push({
      clientName: `${g.clientName} · Editing`,
      dropUrl: token
        ? `${appUrl}/s/${token}`
        : `${appUrl}/admin/editing/projects/${g.projectId}`,
      ctaLabel: `Review ${g.projectName}`,
      comments: g.comments,
    });
  }

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
    calendarComments: comments.length,
    editingComments: editingComments.length,
    sections: groups.length,
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-comment-digest' },
  handleGet,
);
