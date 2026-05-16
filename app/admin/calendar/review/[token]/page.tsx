/**
 * CUP-03 T09: SMM review surface (post-approval variant). Server component.
 * Loads content_drop_share_links by token + the linked drop + posts via
 * `included_post_ids`. Renders the same shell as T08 but reads state from
 * the drop (smm_approved or client_sent). When state is client_sent the
 * action bar shows the Resend variant.
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

interface ShareLinkRow {
  id: string;
  token: string;
  drop_id: string;
  included_post_ids: string[];
  revoked: boolean;
}

interface DropRow {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  handoff_state: HandoffState;
  handoff_history: HandoffHistoryEntry[] | null;
  clients: { id: string; name: string | null } | null;
}

interface PostRow {
  id: string;
  caption: string | null;
  scheduled_at: string | null;
  cover_image_url: string | null;
}

interface VideoRow {
  id: string;
  scheduled_post_id: string | null;
  drive_file_name: string;
  thumbnail_url: string | null;
  order_index: number;
}

export default async function ReviewByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/admin/calendar/review/${token}`);
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
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, token, drop_id, included_post_ids, revoked')
    .eq('token', token)
    .maybeSingle<ShareLinkRow>();
  if (!link) notFound();

  const { data: drop } = await admin
    .from('content_drops')
    .select(
      'id, client_id, start_date, end_date, handoff_state, handoff_history, clients(id, name)',
    )
    .eq('id', link.drop_id)
    .single<DropRow>();
  if (!drop) notFound();

  const postIds = Array.isArray(link.included_post_ids) ? link.included_post_ids : [];

  const postsById: Record<string, PostRow> = {};
  if (postIds.length > 0) {
    const { data: posts } = await admin
      .from('scheduled_posts')
      .select('id, caption, scheduled_at, cover_image_url')
      .in('id', postIds)
      .returns<PostRow[]>();
    for (const p of posts ?? []) postsById[p.id] = p;
  }

  const videosById: Record<string, VideoRow> = {};
  if (postIds.length > 0) {
    const { data: videos } = await admin
      .from('content_drop_videos')
      .select('id, scheduled_post_id, drive_file_name, thumbnail_url, order_index')
      .in('scheduled_post_id', postIds)
      .returns<VideoRow[]>();
    for (const v of videos ?? []) {
      if (v.scheduled_post_id) videosById[v.scheduled_post_id] = v;
    }
  }

  const commentCountByPostId: Record<string, number> = {};
  if (postIds.length > 0) {
    const { data: reviewLinks } = await admin
      .from('post_review_links')
      .select('id, post_id')
      .in('post_id', postIds);
    const linkIdToPostId: Record<string, string> = {};
    const reviewLinkIds: string[] = [];
    for (const r of (reviewLinks ?? []) as Array<{ id: string; post_id: string }>) {
      linkIdToPostId[r.id] = r.post_id;
      reviewLinkIds.push(r.id);
    }
    if (reviewLinkIds.length > 0) {
      const { data: comments } = await admin
        .from('post_review_comments')
        .select('review_link_id')
        .in('review_link_id', reviewLinkIds);
      for (const c of (comments ?? []) as Array<{ review_link_id: string }>) {
        const postId = linkIdToPostId[c.review_link_id];
        if (postId) commentCountByPostId[postId] = (commentCountByPostId[postId] ?? 0) + 1;
      }
    }
  }

  const reviewPosts: ReviewPost[] = postIds
    .map((postId): ReviewPost | null => {
      const post = postsById[postId];
      const video = videosById[postId];
      if (!post && !video) return null;
      return {
        id: postId,
        title: video?.drive_file_name ?? 'Untitled post',
        caption: post?.caption ?? null,
        scheduledAt: post?.scheduled_at ?? null,
        coverImageUrl: post?.cover_image_url ?? video?.thumbnail_url ?? null,
        commentCount: commentCountByPostId[postId] ?? 0,
      };
    })
    .filter((p): p is ReviewPost => p !== null)
    .sort((a, b) => {
      const av = videosById[a.id]?.order_index ?? 0;
      const bv = videosById[b.id]?.order_index ?? 0;
      return av - bv;
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
          <ReviewActionsClient
            dropId={drop.id}
            state={drop.handoff_state}
            shareToken={link.token}
          />
        </aside>
      </div>
    </div>
  );
}
