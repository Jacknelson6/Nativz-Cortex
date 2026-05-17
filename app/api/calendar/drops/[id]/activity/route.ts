import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/drops/:id/activity
 *
 * Powers the "History" tab on the calendar share-link detail dialog.
 *
 * Sources, in priority order:
 *   - share_link        ← a new share link was minted for this drop
 *   - share_link_view   ← someone opened /c/<token>
 *   - email_sent        ← outbound notification. Successful sends come from
 *                         `share_link_emails` so each row carries a clickable
 *                         id + kind ("revisions_complete", "manual_followup",
 *                         etc.) that the dialog opens in the email replay.
 *                         Failed sends still come from `email_messages` —
 *                         they never made it into the archive.
 *   - review_comment    ← approve / comment / video_revised /
 *                         comment from `post_review_comments` (joined to
 *                         this drop via the share-link review_link_map).
 *                         Chat-webhook pings are paired 1:1 with these
 *                         rows, so surfacing comments doubles as the
 *                         "what hit the chat" log Jack asked for.
 */

type Activity =
  | {
      kind: 'share_link';
      at: string;
      detail: { url: string; created_by: string | null };
    }
  | {
      kind: 'share_link_view';
      at: string;
      detail: { viewer_name: string | null; share_url: string };
    }
  | {
      kind: 'email_sent';
      at: string;
      detail: {
        to: string;
        subject: string | null;
        status: string | null;
        failure_reason: string | null;
        email_id: string | null;
        email_kind: string | null;
      };
    }
  | {
      kind: 'review_comment';
      at: string;
      detail: {
        author_name: string;
        status: 'approved' | 'comment' | 'video_revised';
        content: string;
        video_id: string | null;
        attachment_count: number;
      };
    };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();

  const { data: drop } = await admin
    .from('content_drops')
    .select('id')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: links } = await admin
    .from('content_drop_share_links')
    .select('id, token, created_at, post_review_link_map')
    .eq('drop_id', id)
    .returns<
      Array<{
        id: string;
        token: string;
        created_at: string;
        post_review_link_map: Record<string, string> | null;
      }>
    >();
  const linkRows = links ?? [];
  const linkIds = linkRows.map((l) => l.id);

  // Union of every review_link_id this drop's share links know about.
  // We only show review comments that belong to one of *these* review
  // links — anything else is from a different drop.
  const reviewLinkIdSet = new Set<string>();
  for (const sl of linkRows) {
    const map = sl.post_review_link_map ?? {};
    for (const rid of Object.values(map)) {
      if (rid) reviewLinkIdSet.add(rid);
    }
  }
  const reviewLinkIds = Array.from(reviewLinkIdSet);

  const [viewsRes, archivedEmailsRes, failedEmailsRes, commentsRes] =
    await Promise.all([
      linkIds.length
        ? admin
            .from('content_drop_share_link_views')
            .select('share_link_id, viewed_at, viewer_name')
            .in('share_link_id', linkIds)
            .order('viewed_at', { ascending: false })
            .limit(200)
        : Promise.resolve({
            data: [] as Array<{
              share_link_id: string;
              viewed_at: string;
              viewer_name: string | null;
            }>,
          }),
      linkIds.length
        ? admin
            .from('share_link_emails')
            .select('id, kind, subject, recipients, sent_at')
            .in('share_link_id', linkIds)
            .order('sent_at', { ascending: false })
            .limit(200)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              kind: string;
              subject: string | null;
              recipients: Array<{ email: string; name?: string | null }> | null;
              sent_at: string;
            }>,
          }),
      // email_messages on the drop FK still tells us about sends that
      // failed before they could be archived. We filter to status='failed'
      // so we don't double-count successful sends already covered by
      // share_link_emails.
      admin
        .from('email_messages')
        .select('recipient_email, subject, status, failure_reason, sent_at, created_at')
        .eq('drop_id', id)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(200),
      reviewLinkIds.length
        ? admin
            .from('post_review_comments')
            .select(
              'id, review_link_id, author_name, content, status, attachments, created_at',
            )
            .in('review_link_id', reviewLinkIds)
            .in('status', ['approved', 'comment', 'video_revised'])
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              review_link_id: string;
              author_name: string;
              content: string;
              status: string;
              attachments: unknown;
              created_at: string;
            }>,
          }),
    ]);

  const linkById = new Map(linkRows.map((l) => [l.id, l] as const));
  const events: Activity[] = [];

  for (const link of linkRows) {
    events.push({
      kind: 'share_link',
      at: link.created_at,
      detail: {
        url: `/c/${link.token}`,
        // content_drop_share_links has no created_by column today.
        created_by: null,
      },
    });
  }

  for (const v of viewsRes.data ?? []) {
    const link = linkById.get(v.share_link_id);
    events.push({
      kind: 'share_link_view',
      at: v.viewed_at,
      detail: {
        viewer_name: v.viewer_name,
        share_url: link ? `/c/${link.token}` : '',
      },
    });
  }

  for (const e of archivedEmailsRes.data ?? []) {
    const recips = Array.isArray(e.recipients) ? e.recipients : [];
    const firstTo = recips[0]?.email ?? '';
    const moreCount = Math.max(recips.length - 1, 0);
    const toLabel = moreCount > 0 ? `${firstTo} +${moreCount}` : firstTo;
    events.push({
      kind: 'email_sent',
      at: e.sent_at,
      detail: {
        to: toLabel,
        subject: e.subject ?? null,
        status: 'sent',
        failure_reason: null,
        email_id: e.id,
        email_kind: e.kind,
      },
    });
  }

  type FailedRow = {
    recipient_email: string | null;
    subject: string | null;
    status: string | null;
    failure_reason: string | null;
    sent_at: string | null;
    created_at: string | null;
  };
  for (const e of (failedEmailsRes.data ?? []) as FailedRow[]) {
    events.push({
      kind: 'email_sent',
      at: e.sent_at ?? e.created_at ?? new Date().toISOString(),
      detail: {
        to: e.recipient_email ?? '',
        subject: e.subject,
        status: e.status,
        failure_reason: e.failure_reason,
        email_id: null,
        email_kind: null,
      },
    });
  }

  type CommentRow = {
    author_name: string;
    content: string;
    status: 'approved' | 'comment' | 'video_revised';
    attachments: unknown;
    created_at: string;
  };
  for (const c of (commentsRes.data ?? []) as CommentRow[]) {
    const attachments = Array.isArray(c.attachments) ? c.attachments : [];
    events.push({
      kind: 'review_comment',
      at: c.created_at,
      detail: {
        author_name: (c.author_name ?? '').trim() || 'Anonymous',
        status: c.status,
        content: (c.content ?? '').trim(),
        video_id: null,
        attachment_count: attachments.length,
      },
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return NextResponse.json({ activity: events.slice(0, 200) });
}
