'use client';

import { use, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle, Clock, Film, Loader2, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

interface SharedComment {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment';
  created_at: string;
}

interface SharedPost {
  id: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  comments: SharedComment[];
}

interface SharedDrop {
  clientName: string;
  drop: { id: string; start_date: string; end_date: string; default_post_time: string };
  posts: SharedPost[];
  expiresAt: string;
}

type ReviewStatus = 'approved' | 'changes_requested' | 'comment';

export default function PublicCalendarSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedDrop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/calendar/share/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load');
        if (!cancelled) setData(json as SharedDrop);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="text-lg font-semibold text-text-primary">{error ?? 'Link not found'}</h1>
          <p className="mt-1 text-sm text-text-muted">
            This share link may have expired or been deactivated.
          </p>
        </div>
      </div>
    );
  }

  return <SharedDropView data={data} token={token} setData={setData} />;
}

function SharedDropView({
  data,
  token,
  setData,
}: {
  data: SharedDrop;
  token: string;
  setData: (updater: (prev: SharedDrop | null) => SharedDrop | null) => void;
}) {
  const total = data.posts.length;
  const approvedCount = data.posts.filter((p) => latestReview(p.comments) === 'approved').length;
  const changesCount = data.posts.filter((p) => latestReview(p.comments) === 'changes_requested').length;
  const expiresLabel = useMemo(() => {
    const d = new Date(data.expiresAt);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [data.expiresAt]);

  function appendComment(postId: string, comment: SharedComment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId ? { ...p, comments: [...p.comments, comment] } : p,
            ),
          }
        : prev,
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold text-text-primary">
            {data.clientName} — Content drop
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {total} post{total !== 1 ? 's' : ''} to review · scheduled {data.drop.start_date} → {data.drop.end_date}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              <CheckCircle size={12} /> {approvedCount} approved
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
              <AlertTriangle size={12} /> {changesCount} changes requested
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-text-muted">
              <Clock size={12} /> link expires {expiresLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-6">
        <div className="space-y-4">
          {data.posts.map((post, idx) => (
            <PostCard
              key={post.id}
              index={idx + 1}
              post={post}
              token={token}
              onCommentAdded={(c) => appendComment(post.id, c)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function latestReview(comments: SharedComment[]): ReviewStatus | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved' || c.status === 'changes_requested') return c.status;
  }
  return null;
}

function PostCard({
  index,
  post,
  token,
  onCommentAdded,
}: {
  index: number;
  post: SharedPost;
  token: string;
  onCommentAdded: (c: SharedComment) => void;
}) {
  const [authorName, setAuthorName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const review = latestReview(post.comments);
  const scheduledLabel = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unscheduled';

  async function submit(status: ReviewStatus) {
    if (!authorName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (status === 'comment' && !commentText.trim()) {
      toast.error('Please enter a comment');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          authorName: authorName.trim(),
          content:
            commentText.trim() ||
            (status === 'approved'
              ? 'Approved'
              : status === 'changes_requested'
                ? 'Changes requested'
                : ''),
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      onCommentAdded(json.comment as SharedComment);
      setCommentText('');
      toast.success(
        status === 'approved'
          ? 'Post approved'
          : status === 'changes_requested'
            ? 'Changes requested'
            : 'Comment added',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <div className="shrink-0">
          <div className="aspect-[9/16] w-32 overflow-hidden rounded-lg bg-surface-hover md:w-36">
            {post.cover_image_url ? (
              <img
                src={post.cover_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
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
            {post.caption || (
              <span className="italic text-text-muted">No caption yet</span>
            )}
          </p>

          {post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags.map((h) => (
                <span key={h} className="text-xs text-accent-text">
                  #{h}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {post.comments.length > 0 && (
        <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-text-muted">Comments</h3>
          <div className="space-y-2">
            {post.comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-nativz-border px-4 py-3">
        <h3 className="mb-2 text-xs font-medium text-text-muted">Leave feedback</h3>
        <input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your name"
          className="mb-2 w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
          disabled={submitting}
        />
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a comment (optional for approve / changes)"
          rows={2}
          className="mb-3 w-full resize-none rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
          disabled={submitting}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => submit('approved')}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => submit('changes_requested')}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            <AlertTriangle size={12} /> Changes
          </button>
          <button
            type="button"
            onClick={() => submit('comment')}
            disabled={submitting || !commentText.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <MessageSquare size={12} /> Comment
          </button>
        </div>
      </div>
    </article>
  );
}

function CommentRow({ comment }: { comment: SharedComment }) {
  const tone =
    comment.status === 'approved'
      ? 'text-emerald-300'
      : comment.status === 'changes_requested'
        ? 'text-amber-300'
        : 'text-text-secondary';
  const Icon =
    comment.status === 'approved'
      ? CheckCircle
      : comment.status === 'changes_requested'
        ? AlertTriangle
        : MessageSquare;
  const time = new Date(comment.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
