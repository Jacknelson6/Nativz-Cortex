/**
 * CUP-03 T08: SMM review surface (pre-approval variant). Server component.
 * Loads the drop + handoff state/history + scheduled posts + content_drop_videos
 * and renders ReviewHeader + PostListWithEdit + ReviewActionsClient.
 *
 * When the drop is already in `client_sent` we redirect to the post-approval
 * /[token] variant (T09), which surfaces the resend bar instead.
 */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { ReviewHeader } from '@/components/calendar/review/review-header';
import {
  PostListWithEdit,
  type ReviewPost,
} from '@/components/calendar/review/post-list-with-edit';
import { ReviewActionsClient } from '@/components/calendar/review/review-actions-client';
import type {
  HandoffHistoryEntry,
  HandoffState,
} from '@/lib/calendar/handoff-state';

export const dynamic = 'force-dynamic';

interface DropRow {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  handoff_state: HandoffState;
  handoff_history: HandoffHistoryEntry[] | null;
  clients: { id: string; name: string | null } | null;
}

interface VideoRow {
  id: string;
  scheduled_post_id: string | null;
  drive_file_name: string;
  thumbnail_url: string | null;
  draft_caption: string | null;
  draft_scheduled_at: string | null;
  order_index: number;
}

interface PostRow {
  id: string;
  caption: string | null;
  scheduled_at: string | null;
  cover_image_url: string | null;
}

export default async function ReviewDropPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/admin/calendar/review/drop/${id}`);
  }
  if (!(await isAdmin(user.id))) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-3xl space-y-4 py-12">
        <h1 className="text-xl font-semibold text-text-primary">Forbidden</h1>
        <p className="text-sm text-text-secondary">
          You do not have permission to review drops. Ask an admin for access.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: drop } = await admin
    .from('content_drops')
    .select(
      'id, client_id, start_date, end_date, handoff_state, handoff_history, clients(id, name)',
    )
    .eq('id', id)
    .single<DropRow>();

  if (!drop) notFound();

  if (drop.handoff_state === 'client_sent') {
    const { data: link } = await admin
      .from('content_drop_share_links')
      .select('token')
      .eq('drop_id', id)
      .eq('revoked', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ token: string }>();
    if (link?.token) {
      redirect(`/admin/calendar/review/${link.token}`);
    }
  }

  const { data: videosData } = await admin
    .from('content_drop_videos')
    .select(
      'id, scheduled_post_id, drive_file_name, thumbnail_url, draft_caption, draft_scheduled_at, order_index',
    )
    .eq('drop_id', id)
    .order('order_index', { ascending: true })
    .returns<VideoRow[]>();
  const videos = videosData ?? [];
  const scheduledPostIds = videos
    .map((v) => v.scheduled_post_id)
    .filter((p): p is string => typeof p === 'string');

  const postsById: Record<string, PostRow> = {};
  if (scheduledPostIds.length > 0) {
    const { data: posts } = await admin
      .from('scheduled_posts')
      .select('id, caption, scheduled_at, cover_image_url')
      .in('id', scheduledPostIds)
      .returns<PostRow[]>();
    for (const p of posts ?? []) postsById[p.id] = p;
  }

  const commentCountByPostId: Record<string, number> = {};
  if (scheduledPostIds.length > 0) {
    const { data: links } = await admin
      .from('post_review_links')
      .select('id, post_id')
      .in('post_id', scheduledPostIds);
    const linkIdToPostId: Record<string, string> = {};
    const linkIds: string[] = [];
    for (const l of (links ?? []) as Array<{ id: string; post_id: string }>) {
      linkIdToPostId[l.id] = l.post_id;
      linkIds.push(l.id);
    }
    if (linkIds.length > 0) {
      const { data: comments } = await admin
        .from('post_review_comments')
        .select('review_link_id')
        .in('review_link_id', linkIds);
      for (const c of (comments ?? []) as Array<{ review_link_id: string }>) {
        const postId = linkIdToPostId[c.review_link_id];
        if (postId) commentCountByPostId[postId] = (commentCountByPostId[postId] ?? 0) + 1;
      }
    }
  }

  const reviewPosts: ReviewPost[] = videos.map((v) => {
    const post = v.scheduled_post_id ? postsById[v.scheduled_post_id] : undefined;
    return {
      id: v.scheduled_post_id ?? v.id,
      title: v.drive_file_name,
      caption: post?.caption ?? v.draft_caption,
      scheduledAt: post?.scheduled_at ?? v.draft_scheduled_at,
      coverImageUrl: post?.cover_image_url ?? v.thumbnail_url,
      commentCount: v.scheduled_post_id ? commentCountByPostId[v.scheduled_post_id] ?? 0 : 0,
    };
  });

  const clientName = drop.clients?.name ?? 'Untitled brand';
  const history = Array.isArray(drop.handoff_history) ? drop.handoff_history : [];

  const actorIds = Array.from(new Set(history.map((h) => h.actor).filter(Boolean)));
  const actorNameById: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: actors } = await admin
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);
    for (const a of (actors ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      actorNameById[a.id] = a.full_name?.trim() || a.email || a.id;
    }
  }

  return (
    <div className="cortex-page-gutter mx-auto max-w-5xl space-y-6 pb-32 lg:pb-12">
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        <div className="space-y-6">
          <ReviewHeader
            clientName={clientName}
            postCount={reviewPosts.length}
            startDate={drop.start_date}
            endDate={drop.end_date}
            state={drop.handoff_state}
            history={history}
            actorNameById={actorNameById}
          />
          <PostListWithEdit dropId={drop.id} posts={reviewPosts} />
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ReviewActionsClient dropId={drop.id} state={drop.handoff_state} />
        </aside>
      </div>
    </div>
  );
}
