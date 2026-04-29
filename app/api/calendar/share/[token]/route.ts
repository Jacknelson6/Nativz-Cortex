import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';

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
  tagged_people: string[] | null;
  collaborator_handles: string[] | null;
}

interface DropVideoRow {
  scheduled_post_id: string | null;
  video_url: string | null;
  revised_video_url: string | null;
  revised_video_uploaded_at: string | null;
  revised_video_notify_pending: boolean | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}

interface CommentAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

type CommentStatus =
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'caption_edit'
  | 'tag_edit'
  | 'schedule_change'
  | 'video_revised';

interface CommentRow {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  attachments: CommentAttachment[] | null;
  caption_before: string | null;
  caption_after: string | null;
  metadata: Record<string, unknown> | null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();
  const url = new URL(req.url);
  const viewerName = url.searchParams.get('as')?.trim().slice(0, 80) || null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Detect whether the viewer is a signed-in admin so the UI can expose the
  // editor-only affordances (revised-video re-upload + notify toast).
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isEditor = user ? await isAdmin(user.id) : false;

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, included_post_ids, post_review_link_map, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const [{ data: drop }, { data: posts }, { data: videos }] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, start_date, end_date, default_post_time')
      .eq('id', link.drop_id)
      .single(),
    admin
      .from('scheduled_posts')
      .select('id, client_id, caption, hashtags, scheduled_at, status, cover_image_url, late_post_id, tagged_people, collaborator_handles')
      .in('id', link.included_post_ids),
    admin
      .from('content_drop_videos')
      .select('scheduled_post_id, video_url, revised_video_url, revised_video_uploaded_at, revised_video_notify_pending, mux_playback_id, mux_status')
      .in('scheduled_post_id', link.included_post_ids),
  ]);
  if (!drop) return NextResponse.json({ error: 'content calendar missing' }, { status: 404 });

  const videoByPost: Record<string, string> = {};
  const revisionByPost: Record<
    string,
    {
      revised_video_url: string | null;
      revised_video_uploaded_at: string | null;
      revised_video_notify_pending: boolean;
      mux_playback_id: string | null;
      mux_status: string | null;
    }
  > = {};
  for (const v of (videos ?? []) as DropVideoRow[]) {
    if (!v.scheduled_post_id) continue;
    const url = v.revised_video_url ?? v.video_url;
    if (url) videoByPost[v.scheduled_post_id] = url;
    revisionByPost[v.scheduled_post_id] = {
      revised_video_url: v.revised_video_url,
      revised_video_uploaded_at: v.revised_video_uploaded_at,
      revised_video_notify_pending: !!v.revised_video_notify_pending,
      mux_playback_id: v.mux_playback_id,
      mux_status: v.mux_status,
    };
  }

  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', drop.client_id)
    .single();

  const reviewLinkIds = Object.values(link.post_review_link_map ?? {});
  const { data: comments } = reviewLinkIds.length
    ? await admin
        .from('post_review_comments')
        .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata')
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

  // Log the open — both the rolling pointer and an immutable history row.
  // Fire-and-forget; failures here must not block the viewer's response.
  void admin
    .from('content_drop_share_links')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', link.id);
  void admin
    .from('content_drop_share_link_views')
    .insert({
      share_link_id: link.id,
      viewer_name: viewerName,
      user_agent: userAgent,
    });

  return NextResponse.json({
    clientName: client?.name ?? 'Brand',
    isEditor,
    drop: {
      id: drop.id,
      start_date: drop.start_date,
      end_date: drop.end_date,
      default_post_time: drop.default_post_time,
    },
    posts: ((posts ?? []) as ScheduledPostRow[]).map((p) => {
      const rev = revisionByPost[p.id];
      return {
        id: p.id,
        caption: p.caption,
        hashtags: p.hashtags ?? [],
        scheduled_at: p.scheduled_at,
        status: p.status,
        cover_image_url: p.cover_image_url,
        video_url: videoByPost[p.id] ?? null,
        tagged_people: p.tagged_people ?? [],
        collaborator_handles: p.collaborator_handles ?? [],
        revised_video_url: rev?.revised_video_url ?? null,
        revised_video_uploaded_at: rev?.revised_video_uploaded_at ?? null,
        revised_video_notify_pending: rev?.revised_video_notify_pending ?? false,
        mux_playback_id: rev?.mux_playback_id ?? null,
        mux_status: rev?.mux_status ?? null,
        comments: (commentsByPost[p.id] ?? []).map((c) => ({
          id: c.id,
          review_link_id: c.review_link_id,
          author_name: c.author_name,
          content: c.content,
          status: c.status,
          created_at: c.created_at,
          attachments: c.attachments ?? [],
          caption_before: c.caption_before,
          caption_after: c.caption_after,
          metadata: c.metadata ?? {},
        })),
      };
    }),
    expiresAt: link.expires_at,
  });
}
