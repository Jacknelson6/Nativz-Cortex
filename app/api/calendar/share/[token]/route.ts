import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ShareLinkRow {
  id: string;
  drop_id: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
}

interface ScheduledPostRow {
  id: string;
  client_id: string;
  caption: string;
  hashtags: string[] | null;
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  late_post_id: string | null;
}

interface CommentRow {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment';
  created_at: string;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, included_post_ids, post_review_link_map, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const [{ data: drop }, { data: posts }] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, start_date, end_date, default_post_time')
      .eq('id', link.drop_id)
      .single(),
    admin
      .from('scheduled_posts')
      .select('id, client_id, caption, hashtags, scheduled_at, status, cover_image_url, late_post_id')
      .in('id', link.included_post_ids),
  ]);
  if (!drop) return NextResponse.json({ error: 'content calendar missing' }, { status: 404 });

  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', drop.client_id)
    .single();

  const reviewLinkIds = Object.values(link.post_review_link_map ?? {});
  const { data: comments } = reviewLinkIds.length
    ? await admin
        .from('post_review_comments')
        .select('id, review_link_id, author_name, content, status, created_at')
        .in('review_link_id', reviewLinkIds)
        .order('created_at', { ascending: true })
    : { data: [] as CommentRow[] };

  const commentsByPost: Record<string, CommentRow[]> = {};
  const reviewLinkToPostId: Record<string, string> = {};
  for (const [postId, reviewId] of Object.entries(link.post_review_link_map ?? {})) {
    reviewLinkToPostId[reviewId] = postId;
  }
  for (const c of (comments ?? []) as CommentRow[]) {
    const postId = reviewLinkToPostId[c.review_link_id];
    if (!postId) continue;
    (commentsByPost[postId] ||= []).push(c);
  }

  // Update last_viewed_at (fire and forget — not required for the response).
  void admin
    .from('content_drop_share_links')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', link.id);

  return NextResponse.json({
    clientName: client?.name ?? 'Brand',
    drop: {
      id: drop.id,
      start_date: drop.start_date,
      end_date: drop.end_date,
      default_post_time: drop.default_post_time,
    },
    posts: ((posts ?? []) as ScheduledPostRow[]).map((p) => ({
      id: p.id,
      caption: p.caption,
      hashtags: p.hashtags ?? [],
      scheduled_at: p.scheduled_at,
      status: p.status,
      cover_image_url: p.cover_image_url,
      comments: commentsByPost[p.id] ?? [],
    })),
    expiresAt: link.expires_at,
  });
}
