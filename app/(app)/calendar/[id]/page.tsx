import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, CheckCircle, Clock, Film, MessageSquare, Type,
} from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ReviewStatus = 'approved' | 'changes_requested' | 'comment';
type CommentStatus = ReviewStatus | 'caption_edit';

interface DropComment {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  caption_before: string | null;
  caption_after: string | null;
}

interface ShareLinkRow {
  post_review_link_map: Record<string, string> | null;
}

export default async function ViewerCalendarDropPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveBrand().catch(() => null);
  if (active?.isAdmin) redirect(`/admin/calendar/${id}`);

  if (!active?.brand) redirect('/calendar');

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: access } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', user.id)
    .eq('client_id', active.brand.id)
    .maybeSingle();
  if (!access) redirect('/');

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, start_date, end_date, default_post_time, status')
    .eq('id', id)
    .eq('client_id', active.brand.id)
    .single();
  if (!drop) notFound();
  if (drop.status !== 'ready' && drop.status !== 'scheduled') notFound();

  const [{ data: videos }, { data: shareLinks }] = await Promise.all([
    admin
      .from('content_drop_videos')
      .select('id, scheduled_post_id, drive_file_name, thumbnail_url, draft_caption, order_index, status')
      .eq('drop_id', id)
      .eq('status', 'ready')
      .order('order_index'),
    admin
      .from('content_drop_share_links')
      .select('post_review_link_map')
      .eq('drop_id', id),
  ]);

  // Pull scheduled_post details for any videos that have been scheduled
  // (caption + scheduled_at on scheduled_posts is the authoritative copy
  // once the drop has been put on the calendar; before scheduling we fall
  // back to the video's draft_caption).
  const scheduledPostIds = (videos ?? [])
    .map((v) => v.scheduled_post_id)
    .filter((x): x is string => Boolean(x));
  const { data: posts } = scheduledPostIds.length
    ? await admin
        .from('scheduled_posts')
        .select('id, caption, hashtags, scheduled_at, cover_image_url')
        .in('id', scheduledPostIds)
    : { data: [] };

  const postById = new Map(
    ((posts ?? []) as { id: string; caption: string; hashtags: string[] | null; scheduled_at: string | null; cover_image_url: string | null }[])
      .map((p) => [p.id, p]),
  );

  // Aggregate comments across all share links generated for this drop —
  // a drop can have multiple shares if Jack regenerated, so collect them all.
  const reviewLinkToPostId: Record<string, string> = {};
  for (const link of (shareLinks ?? []) as ShareLinkRow[]) {
    for (const [postId, reviewId] of Object.entries(link.post_review_link_map ?? {})) {
      reviewLinkToPostId[reviewId] = postId;
    }
  }
  const reviewLinkIds = Object.keys(reviewLinkToPostId);
  const { data: comments } = reviewLinkIds.length
    ? await admin
        .from('post_review_comments')
        .select('id, review_link_id, author_name, content, status, created_at, caption_before, caption_after')
        .in('review_link_id', reviewLinkIds)
        .order('created_at', { ascending: true })
    : { data: [] as DropComment[] };

  const commentsByPostId: Record<string, DropComment[]> = {};
  for (const c of (comments ?? []) as DropComment[]) {
    const postId = reviewLinkToPostId[c.review_link_id];
    if (!postId) continue;
    (commentsByPostId[postId] ||= []).push(c);
  }

  const totalPosts = (videos ?? []).length;

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={12} />
          All content calendars
        </Link>
      </div>

      <header className="rounded-xl border border-nativz-border bg-surface px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">
          {active.brand.name} — Content calendar
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {totalPosts} post{totalPosts !== 1 ? 's' : ''} · scheduled {drop.start_date} → {drop.end_date}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <DropStatusPill status={drop.status as 'ready' | 'scheduled'} />
        </div>
      </header>

      <main className="space-y-4">
        {(videos ?? []).map((v, idx) => {
          const post = v.scheduled_post_id ? postById.get(v.scheduled_post_id) : null;
          const caption = post?.caption ?? v.draft_caption ?? '';
          const hashtags = post?.hashtags ?? [];
          const scheduledAt = post?.scheduled_at ?? null;
          const cover = post?.cover_image_url ?? v.thumbnail_url ?? null;
          const postKey = v.scheduled_post_id ?? v.id;
          const cardComments = v.scheduled_post_id ? commentsByPostId[v.scheduled_post_id] ?? [] : [];
          return (
            <PostCard
              key={postKey}
              index={idx + 1}
              caption={caption}
              hashtags={hashtags}
              scheduledAt={scheduledAt}
              cover={cover}
              comments={cardComments}
            />
          );
        })}
        {totalPosts === 0 && (
          <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
            This content calendar has no posts ready to review yet.
          </div>
        )}
      </main>
    </div>
  );
}

function DropStatusPill({ status }: { status: 'ready' | 'scheduled' }) {
  if (status === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
        <CheckCircle size={11} />
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
      <Clock size={11} />
      In review
    </span>
  );
}

function latestReview(comments: DropComment[]): ReviewStatus | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved' || c.status === 'changes_requested') return c.status;
  }
  return null;
}

function PostCard({
  index,
  caption,
  hashtags,
  scheduledAt,
  cover,
  comments,
}: {
  index: number;
  caption: string;
  hashtags: string[];
  scheduledAt: string | null;
  cover: string | null;
  comments: DropComment[];
}) {
  const review = latestReview(comments);
  const scheduledLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unscheduled';

  return (
    <article className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <div className="shrink-0">
          <div className="aspect-[9/16] w-32 overflow-hidden rounded-lg bg-surface-hover md:w-36">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Film size={28} className="text-text-muted" />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-muted">Post {index}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
              <Clock size={11} /> {scheduledLabel}
            </span>
            {review === 'approved' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                <CheckCircle size={11} /> Approved
              </span>
            )}
            {review === 'changes_requested' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                <AlertTriangle size={11} /> Changes requested
              </span>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
            {caption || <span className="italic text-text-muted">No caption yet</span>}
          </p>

          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((h) => (
                <span key={h} className="text-xs text-accent-text">
                  #{h}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {comments.length > 0 && (
        <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-text-muted">
            {comments.length} revision{comments.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function CommentRow({ comment }: { comment: DropComment }) {
  const tone =
    comment.status === 'approved'
      ? 'text-emerald-300'
      : comment.status === 'changes_requested'
        ? 'text-amber-300'
        : comment.status === 'caption_edit'
          ? 'text-accent-text'
          : 'text-text-secondary';
  const Icon =
    comment.status === 'approved'
      ? CheckCircle
      : comment.status === 'changes_requested'
        ? AlertTriangle
        : comment.status === 'caption_edit'
          ? Type
          : MessageSquare;
  const time = new Date(comment.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (comment.status === 'caption_edit') {
    return (
      <div className="rounded-lg border border-accent-text/25 bg-accent-text/5 px-3 py-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px]">
          <Icon size={11} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">edited the caption · {time}</span>
        </div>
        {comment.caption_before !== null && (
          <details className="mb-1.5 text-[11px] text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary">Show previous caption</summary>
            <p className="mt-1 whitespace-pre-wrap rounded border border-nativz-border bg-background/40 px-2 py-1.5 text-text-muted">
              {comment.caption_before || <span className="italic">(empty)</span>}
            </p>
          </details>
        )}
        {comment.caption_after !== null && (
          <p className="whitespace-pre-wrap text-xs text-text-secondary">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Now: </span>
            {comment.caption_after}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-nativz-border bg-surface px-3 py-2">
      <div className="mb-0.5 flex items-center gap-2 text-xs">
        <Icon size={11} className={tone} />
        <span className="font-medium text-text-primary">{comment.author_name}</span>
        <span className="text-text-muted">· {time}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-text-secondary">{comment.content}</p>
    </div>
  );
}
