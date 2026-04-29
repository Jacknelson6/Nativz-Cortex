'use client';

import Image from 'next/image';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, AtSign, BellRing, CalendarDays, CheckCircle, Clock,
  File as FileIcon, Film, List, Loader2, MessageSquare, Paperclip, Pencil, Play,
  Plus, Send, Tag, Type, Undo2, Upload, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

const SKIP_DELETE_CONFIRM_KEY = 'cortex.share.skipDeleteConfirm';

interface CommentAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

type SharedCommentStatus =
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'caption_edit'
  | 'tag_edit'
  | 'schedule_change'
  | 'video_revised';

interface SharedComment {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: SharedCommentStatus;
  created_at: string;
  attachments: CommentAttachment[];
  caption_before: string | null;
  caption_after: string | null;
  metadata: Record<string, unknown>;
}

interface SharedPost {
  id: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  video_url: string | null;
  tagged_people: string[];
  collaborator_handles: string[];
  revised_video_url: string | null;
  revised_video_uploaded_at: string | null;
  revised_video_notify_pending: boolean;
  comments: SharedComment[];
}

interface SharedDrop {
  clientName: string;
  isEditor: boolean;
  drop: { id: string; start_date: string; end_date: string; default_post_time: string };
  posts: SharedPost[];
  expiresAt: string;
}

type ReviewStatus = 'approved' | 'changes_requested' | 'comment';
type ViewMode = 'list' | 'calendar';

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
        const storedName =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(`cortex_share_name_${token}`)?.trim() ?? ''
            : '';
        const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
        const res = await fetch(`/api/calendar/share/${token}${qs}`);
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
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-status-danger" />
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
  const storageKey = `cortex_share_name_${token}`;
  const [authorName, setAuthorName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [playingPost, setPlayingPost] = useState<SharedPost | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored && stored.trim()) {
      setAuthorName(stored.trim());
    } else {
      setNameModalOpen(true);
    }
  }, [storageKey]);

  function saveName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error('Please enter your name');
      return;
    }
    setAuthorName(trimmed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, trimmed);
    }
    setNameModalOpen(false);
  }

  // Show unscheduled posts at the top, then chronological by scheduled_at
  // ascending. Mirrors how editors think about the timeline.
  const sortedPosts = useMemo(() => sortPostsForList(data.posts), [data.posts]);

  const total = data.posts.length;
  const approvedCount = data.posts.filter((p) => latestReview(p.comments) === 'approved').length;
  const changesCount = data.posts.filter((p) => latestReview(p.comments) === 'changes_requested').length;
  const pendingRevisionCount = data.isEditor
    ? data.posts.filter((p) => p.revised_video_notify_pending).length
    : 0;
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

  function updatePostCaption(postId: string, caption: string, comment: SharedComment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? { ...p, caption, comments: [...p.comments, comment] }
                : p,
            ),
          }
        : prev,
    );
  }

  function removeComment(postId: string, commentId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) }
                : p,
            ),
          }
        : prev,
    );
  }

  function updateComment(postId: string, comment: SharedComment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    comments: p.comments.map((c) => (c.id === comment.id ? comment : c)),
                  }
                : p,
            ),
          }
        : prev,
    );
  }

  function updatePostHandles(
    postId: string,
    field: 'tagged_people' | 'collaborator_handles',
    next: string[],
    comment: SharedComment | null,
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    [field]: next,
                    comments: comment ? [...p.comments, comment] : p.comments,
                  }
                : p,
            ),
          }
        : prev,
    );
  }

  function updatePostScheduledAt(
    postId: string,
    nextAt: string | null,
    comment: SharedComment | null,
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    scheduled_at: nextAt,
                    comments: comment ? [...p.comments, comment] : p.comments,
                  }
                : p,
            ),
          }
        : prev,
    );
  }

  function updatePostRevision(
    postId: string,
    revision: { revised_video_url: string; revised_video_uploaded_at: string; revised_video_notify_pending: boolean },
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    video_url: revision.revised_video_url,
                    revised_video_url: revision.revised_video_url,
                    revised_video_uploaded_at: revision.revised_video_uploaded_at,
                    revised_video_notify_pending: revision.revised_video_notify_pending,
                  }
                : p,
            ),
          }
        : prev,
    );
  }

  function clearRevisionPending() {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.revised_video_notify_pending ? { ...p, revised_video_notify_pending: false } : p,
            ),
          }
        : prev,
    );
  }

  async function refetch() {
    try {
      const storedName =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(storageKey)?.trim() ?? ''
          : '';
      const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
      const res = await fetch(`/api/calendar/share/${token}${qs}`);
      const json = await res.json();
      if (res.ok) setData(() => json as SharedDrop);
    } catch {
      // refetch failure is non-fatal; UI keeps the optimistic state
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-4 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center sm:mb-5">
            <ShareHeaderLogo />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold tracking-tight text-text-primary sm:text-2xl">
                {data.clientName} — Content calendar
              </h1>
              <p className="mt-1.5 text-[13px] text-text-secondary sm:text-sm">
                {total} post{total !== 1 ? 's' : ''} to review · scheduled {data.drop.start_date} → {data.drop.end_date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {authorName && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingName(authorName);
                    setNameModalOpen(true);
                  }}
                  className="rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
                  title="Change name"
                >
                  {authorName}
                </button>
              )}
              <div className="inline-flex overflow-hidden rounded-[var(--nz-btn-radius)] border border-nativz-border">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                  aria-label="List view"
                >
                  <List size={14} /> <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`inline-flex items-center gap-1.5 border-l border-nativz-border px-3.5 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                  aria-label="Calendar view"
                >
                  <CalendarDays size={14} /> <span className="hidden sm:inline">Calendar</span>
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-status-success/12 px-2 py-0.5 text-status-success">
              <CheckCircle size={12} /> {approvedCount} approved
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/12 px-2 py-0.5 text-status-warning">
              <AlertTriangle size={12} /> {changesCount} changes requested
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-text-muted">
              <Clock size={12} /> link expires {expiresLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {viewMode === 'list' ? (
          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
            {sortedPosts.map((post, idx) => (
              <PostCard
                key={post.id}
                index={idx + 1}
                post={post}
                isEditor={data.isEditor}
                defaultPostTime={data.drop.default_post_time}
                token={token}
                authorName={authorName}
                onCommentAdded={(c) => appendComment(post.id, c)}
                onCommentRemoved={(commentId) => removeComment(post.id, commentId)}
                onCommentUpdated={(c) => updateComment(post.id, c)}
                onCaptionUpdated={(caption, c) => updatePostCaption(post.id, caption, c)}
                onHandlesUpdated={(field, next, c) => updatePostHandles(post.id, field, next, c)}
                onScheduleUpdated={(at, c) => updatePostScheduledAt(post.id, at, c)}
                onRevisionUploaded={(rev) => updatePostRevision(post.id, rev)}
                onPlay={() => setPlayingPost(post)}
                requireName={() => {
                  setPendingName(authorName);
                  setNameModalOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <CalendarGrid posts={sortedPosts} drop={data.drop} onSelect={(p) => setDetailPostId(p.id)} />
        )}
      </main>

      {data.isEditor && pendingRevisionCount > 0 && (
        <NotifyRevisionsToast
          token={token}
          count={pendingRevisionCount}
          onDone={async (didNotify) => {
            clearRevisionPending();
            if (didNotify) {
              // Refetch so the inserted video_revised comment rows show up
              // in the share-link history without a page reload.
              await refetch();
            }
          }}
        />
      )}

      <Dialog
        open={nameModalOpen}
        onClose={() => {
          if (authorName.trim()) {
            setNameModalOpen(false);
          } else {
            toast.error('Please enter your name to continue');
          }
        }}
        onCancel={(e) => {
          if (!authorName.trim()) e.preventDefault();
        }}
        title=""
        maxWidth="sm"
      >
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">Welcome</h2>
          <p className="text-sm text-text-secondary">
            Tell us who&apos;s reviewing so your feedback is attributed correctly.
          </p>
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName(pendingName);
            }}
            placeholder="Your name"
            autoFocus
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => saveName(pendingName)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      </Dialog>

      <VideoPlayerModal post={playingPost} onClose={() => setPlayingPost(null)} />

      <PostDetailModal
        post={detailPostId ? sortedPosts.find((p) => p.id === detailPostId) ?? null : null}
        index={detailPostId ? sortedPosts.findIndex((p) => p.id === detailPostId) + 1 : 0}
        isEditor={data.isEditor}
        defaultPostTime={data.drop.default_post_time}
        token={token}
        authorName={authorName}
        onCommentAdded={appendComment}
        onCommentRemoved={removeComment}
        onCommentUpdated={updateComment}
        onCaptionUpdated={updatePostCaption}
        onHandlesUpdated={updatePostHandles}
        onScheduleUpdated={updatePostScheduledAt}
        onRevisionUploaded={updatePostRevision}
        onClose={() => setDetailPostId(null)}
        requireName={() => {
          setPendingName(authorName);
          setNameModalOpen(true);
        }}
      />
    </div>
  );
}

function ShareHeaderLogo() {
  const { mode } = useBrandMode();
  if (mode === 'nativz') {
    return (
      <Image
        src="/nativz-logo.png"
        alt="Nativz"
        width={120}
        height={45}
        className="h-5 w-auto sm:h-6"
        priority
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/anderson-logo-dark.svg"
      alt="Anderson Collaborative"
      className="h-5 w-auto sm:h-6"
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  );
}

function latestReview(comments: SharedComment[]): ReviewStatus | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved' || c.status === 'changes_requested') return c.status;
  }
  return null;
}

function findLatestApprovedId(comments: SharedComment[]): string | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].status === 'approved') return comments[i].id;
  }
  return null;
}

function VideoPlayerModal({ post, onClose }: { post: SharedPost | null; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Mobile Safari blocks autoplay-with-sound when the video element wasn't
  // mounted in the same tap that opened the modal. Try to play on mount, and
  // if the browser refuses, retry muted so playback at least starts — the
  // user can unmute via the controls.
  useEffect(() => {
    if (!post) return;
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {
        // Final fallback: leave the controls visible so the user can tap play.
      });
    });
  }, [post]);

  if (!post) return null;
  return (
    <Dialog open={!!post} onClose={onClose} title="" maxWidth="lg" bodyClassName="p-0">
      <div className="relative bg-black">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {post.video_url ? (
          <video
            ref={videoRef}
            src={post.video_url}
            controls
            playsInline
            preload="auto"
            poster={post.cover_image_url ?? undefined}
            className="mx-auto block max-h-[80vh] w-auto"
          />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center">
            <div className="text-center text-text-muted">
              <Film className="mx-auto mb-2" size={32} />
              <p className="text-sm">Video not available</p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function PostDetailModal({
  post,
  index,
  isEditor,
  defaultPostTime,
  token,
  authorName,
  onCommentAdded,
  onCommentRemoved,
  onCommentUpdated,
  onCaptionUpdated,
  onHandlesUpdated,
  onScheduleUpdated,
  onRevisionUploaded,
  onClose,
  requireName,
}: {
  post: SharedPost | null;
  index: number;
  isEditor: boolean;
  defaultPostTime: string;
  token: string;
  authorName: string;
  onCommentAdded: (postId: string, c: SharedComment) => void;
  onCommentRemoved: (postId: string, commentId: string) => void;
  onCommentUpdated: (postId: string, c: SharedComment) => void;
  onCaptionUpdated: (postId: string, caption: string, c: SharedComment) => void;
  onHandlesUpdated: (
    postId: string,
    field: 'tagged_people' | 'collaborator_handles',
    next: string[],
    c: SharedComment | null,
  ) => void;
  onScheduleUpdated: (postId: string, nextAt: string | null, c: SharedComment | null) => void;
  onRevisionUploaded: (
    postId: string,
    rev: { revised_video_url: string; revised_video_uploaded_at: string; revised_video_notify_pending: boolean },
  ) => void;
  onClose: () => void;
  requireName: () => void;
}) {
  if (!post) return null;
  return (
    <Dialog open={!!post} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0" className="max-h-[92vh]">
      <div className="max-h-[92vh] overflow-y-auto">
        <PostCard
          index={index}
          post={post}
          isEditor={isEditor}
          defaultPostTime={defaultPostTime}
          token={token}
          authorName={authorName}
          onCommentAdded={(c) => onCommentAdded(post.id, c)}
          onCommentRemoved={(commentId) => onCommentRemoved(post.id, commentId)}
          onCommentUpdated={(c) => onCommentUpdated(post.id, c)}
          onCaptionUpdated={(caption, c) => onCaptionUpdated(post.id, caption, c)}
          onHandlesUpdated={(field, next, c) => onHandlesUpdated(post.id, field, next, c)}
          onScheduleUpdated={(at, c) => onScheduleUpdated(post.id, at, c)}
          onRevisionUploaded={(rev) => onRevisionUploaded(post.id, rev)}
          requireName={requireName}
          withVideoHeader
        />
      </div>
    </Dialog>
  );
}

function CalendarGrid({
  posts,
  drop,
  onSelect,
}: {
  posts: SharedPost[];
  drop: SharedDrop['drop'];
  onSelect: (post: SharedPost) => void;
}) {
  const { weeks, monthLabel } = useMemo(() => buildCalendarWeeks(posts, drop), [posts, drop]);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-2 sm:p-4">
      <h2 className="mb-2 px-1 text-sm font-medium text-text-primary sm:mb-3 sm:px-0">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted sm:gap-1 sm:text-[11px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {weeks.flat().map((cell, idx) => (
          <CalendarCell key={idx} cell={cell} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

interface CalendarCell {
  date: Date;
  inMonth: boolean;
  posts: SharedPost[];
}

function CalendarCell({
  cell,
  onSelect,
}: {
  cell: CalendarCell;
  onSelect: (post: SharedPost) => void;
}) {
  const isToday = isSameDay(cell.date, new Date());
  return (
    <div
      className={`relative flex aspect-square min-h-[44px] flex-col rounded-md border p-1 sm:min-h-[72px] sm:p-1.5 ${
        cell.inMonth
          ? 'border-nativz-border bg-background/40'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] ${
            isToday
              ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-contrast'
              : cell.inMonth
                ? 'text-text-secondary'
                : 'text-text-muted/40'
          }`}
        >
          {cell.date.getDate()}
        </span>
        {cell.posts.length > 1 && (
          <span className="text-[10px] text-text-muted">+{cell.posts.length - 1}</span>
        )}
      </div>
      {cell.posts.slice(0, 1).map((p) => {
        const review = latestReview(p.comments);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="group relative mt-1 block flex-1 overflow-hidden rounded-sm bg-surface-hover transition-transform hover:scale-[1.02]"
            title={p.caption.slice(0, 80)}
          >
            {p.cover_image_url ? (
              <img
                src={p.cover_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Film size={14} className="text-text-muted" />
              </div>
            )}
            {p.video_url && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 shadow ring-1 ring-white/20 backdrop-blur-sm">
                  <Play size={10} className="ml-px text-white" fill="white" />
                </div>
              </div>
            )}
            {review === 'approved' && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-status-success p-0.5">
                <CheckCircle size={9} className="text-accent-contrast" />
              </span>
            )}
            {review === 'changes_requested' && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-status-warning p-0.5">
                <AlertTriangle size={9} className="text-accent-contrast" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function buildCalendarWeeks(posts: SharedPost[], drop: SharedDrop['drop']) {
  const postsByDay: Record<string, SharedPost[]> = {};
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const key = ymdKey(new Date(p.scheduled_at));
    (postsByDay[key] ||= []).push(p);
  }

  const anchor = posts.find((p) => p.scheduled_at)?.scheduled_at ?? drop.start_date;
  const ref = new Date(anchor);
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const weeks: CalendarCell[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor);
      week.push({
        date,
        inMonth: date.getMonth() === monthStart.getMonth(),
        posts: postsByDay[ymdKey(date)] ?? [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return {
    weeks,
    monthLabel: monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
}

function ymdKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function PostCard({
  index,
  post,
  isEditor,
  defaultPostTime,
  token,
  authorName,
  onCommentAdded,
  onCommentRemoved,
  onCommentUpdated,
  onCaptionUpdated,
  onHandlesUpdated,
  onScheduleUpdated,
  onRevisionUploaded,
  onPlay,
  requireName,
  withVideoHeader = false,
}: {
  index: number;
  post: SharedPost;
  isEditor: boolean;
  defaultPostTime: string;
  token: string;
  authorName: string;
  onCommentAdded: (c: SharedComment) => void;
  onCommentRemoved: (commentId: string) => void;
  onCommentUpdated: (c: SharedComment) => void;
  onCaptionUpdated: (caption: string, c: SharedComment) => void;
  onHandlesUpdated: (
    field: 'tagged_people' | 'collaborator_handles',
    next: string[],
    c: SharedComment | null,
  ) => void;
  onScheduleUpdated: (nextAt: string | null, c: SharedComment | null) => void;
  onRevisionUploaded: (rev: {
    revised_video_url: string;
    revised_video_uploaded_at: string;
    revised_video_notify_pending: boolean;
  }) => void;
  onPlay?: () => void;
  requireName: () => void;
  withVideoHeader?: boolean;
}) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingApproval, setRemovingApproval] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(post.caption);
  const [savingCaption, setSavingCaption] = useState(false);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  const revisionInputRef = useRef<HTMLInputElement>(null);
  const isPublished =
    post.status === 'published' || post.status === 'publishing' || post.status === 'partially_failed';

  const review = latestReview(post.comments);
  const latestApprovedId = review === 'approved' ? findLatestApprovedId(post.comments) : null;
  const scheduledLabel = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unscheduled';

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (pendingAttachments.length + files.length > 10) {
      toast.error('Up to 10 attachments per comment');
      return;
    }
    setUploading(true);
    const next: CommentAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/calendar/share/${token}/upload`, {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Upload failed');
        next.push(json as CommentAttachment);
      }
      setPendingAttachments((prev) => [...prev, ...next]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(url: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  async function saveCaption() {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    const next = draftCaption.trim();
    if (next === post.caption.trim()) {
      setEditingCaption(false);
      return;
    }
    setSavingCaption(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          authorName: authorName.trim(),
          caption: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to save caption');
      onCaptionUpdated(json.caption as string, json.comment as SharedComment);
      setEditingCaption(false);
      toast.success('Caption updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save caption');
    } finally {
      setSavingCaption(false);
    }
  }

  async function submit(status: ReviewStatus) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (status === 'changes_requested' && !commentText.trim() && pendingAttachments.length === 0) {
      toast.error('Please enter revision notes or attach a file');
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
            (status === 'approved' ? 'Approved' : ''),
          status,
          attachments: pendingAttachments,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      const savedComment = json.comment as SharedComment;
      onCommentAdded(savedComment);
      setCommentText('');
      setPendingAttachments([]);
      // Server may auto-upgrade a "changes_requested" submission to "approved"
      // when the body reads like an approval ("approved", "love this", etc.).
      // Reflect the actual recorded status in the toast so the user isn't
      // confused when their "revision" turns into a green checkmark.
      const wasAutoApproved = status !== 'approved' && savedComment.status === 'approved';
      toast.success(
        wasAutoApproved
          ? 'Looked like an approval — marked approved'
          : status === 'approved'
            ? 'Post approved'
            : 'Revision added',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeHandle(
    field: 'tagged_people' | 'collaborator_handles',
    handle: string,
    action: 'add' | 'remove',
  ) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    const cleaned = handle.trim().replace(/^@+/, '');
    if (!cleaned) return;
    try {
      const res = await fetch(`/api/calendar/share/${token}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          authorName: authorName.trim(),
          action,
          kind: field === 'tagged_people' ? 'tag' : 'collab',
          handle: cleaned,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update');
      const next = (json[field] as string[] | undefined) ?? [];
      onHandlesUpdated(field, next, (json.comment as SharedComment | null) ?? null);
      toast.success(action === 'add' ? `${field === 'tagged_people' ? 'Tag' : 'Collaborator'} added` : 'Removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function saveSchedule(nextAt: string | null) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (isPublished) {
      toast.error('Already published — date is locked');
      return;
    }
    setSavingSchedule(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          authorName: authorName.trim(),
          scheduledAt: nextAt,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update date');
      onScheduleUpdated(json.scheduledAt as string | null, (json.comment as SharedComment | null) ?? null);
      setSchedulePopoverOpen(false);
      toast.success('Date updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update date');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function uploadRevisionFile(file: File) {
    if (!isEditor) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Choose a video file');
      return;
    }
    setUploadingRevision(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/calendar/share/${token}/revision/${post.id}`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Upload failed');
      onRevisionUploaded({
        revised_video_url: json.url as string,
        revised_video_uploaded_at: json.uploaded_at as string,
        revised_video_notify_pending: true,
      });
      toast.success('Revised video uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingRevision(false);
      if (revisionInputRef.current) revisionInputRef.current.value = '';
    }
  }

  async function removeApproval() {
    if (!latestApprovedId) return;
    setRemovingApproval(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: latestApprovedId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to remove approval');
      onCommentRemoved(latestApprovedId);
      toast.success('Approval removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove approval');
    } finally {
      setRemovingApproval(false);
    }
  }

  const captionBlock = (
    <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <SchedulePill
          scheduledAt={post.scheduled_at}
          scheduledLabel={scheduledLabel}
          isPublished={isPublished}
          defaultPostTime={defaultPostTime}
          open={schedulePopoverOpen}
          onOpenChange={(v) => {
            if (v && !authorName.trim()) {
              requireName();
              return;
            }
            setSchedulePopoverOpen(v);
          }}
          saving={savingSchedule}
          onSave={saveSchedule}
        />
        {review === 'approved' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/12 px-3 py-1.5 text-sm font-medium text-status-success ring-1 ring-status-success/30">
            <CheckCircle size={13} /> Approved
          </span>
        )}
        {review === 'changes_requested' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning/12 px-3 py-1.5 text-sm font-medium text-status-warning ring-1 ring-status-warning/30">
            <AlertTriangle size={13} /> Changes requested
          </span>
        )}
      </div>

      {editingCaption ? (
        <div className="space-y-2">
          <textarea
            value={draftCaption}
            onChange={(e) => setDraftCaption(e.target.value)}
            rows={Math.max(
              6,
              Math.min(
                24,
                draftCaption
                  .split('\n')
                  .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 55)), 0) + 1,
              ),
            )}
            disabled={savingCaption}
            autoFocus
            className="w-full resize-y rounded-lg border border-accent/40 bg-background/60 px-3 py-2.5 text-[15px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftCaption(post.caption);
                setEditingCaption(false);
              }}
              disabled={savingCaption}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCaption}
              disabled={savingCaption || !draftCaption.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingCaption ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Save caption
            </button>
          </div>
        </div>
      ) : (
        <div className="group relative">
          <p className="whitespace-pre-wrap pr-10 text-[15px] leading-relaxed text-text-primary">
            {post.caption || (
              <span className="italic text-text-muted">No caption yet</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              if (!authorName.trim()) {
                requireName();
                return;
              }
              setDraftCaption(post.caption);
              setEditingCaption(true);
            }}
            className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-md border border-nativz-border bg-surface px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover"
            title="Edit caption"
          >
            <Pencil size={11} /> Edit
          </button>
        </div>
      )}

      {!editingCaption && post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((h) => (
            <span key={h} className="text-sm text-accent-text">
              #{h}
            </span>
          ))}
        </div>
      )}

      <HandleEditor
        label="Tagged"
        icon={Tag}
        placeholder="@username"
        handles={post.tagged_people}
        disabled={isPublished}
        onAdd={(h) => changeHandle('tagged_people', h, 'add')}
        onRemove={(h) => changeHandle('tagged_people', h, 'remove')}
        requireName={() => {
          if (!authorName.trim()) requireName();
        }}
        hasName={!!authorName.trim()}
      />
      <HandleEditor
        label="Collaborators"
        icon={Users}
        placeholder="@collab"
        handles={post.collaborator_handles}
        disabled={isPublished}
        onAdd={(h) => changeHandle('collaborator_handles', h, 'add')}
        onRemove={(h) => changeHandle('collaborator_handles', h, 'remove')}
        requireName={() => {
          if (!authorName.trim()) requireName();
        }}
        hasName={!!authorName.trim()}
      />
    </div>
  );

  return (
    <article
      className={
        withVideoHeader
          ? 'overflow-hidden bg-surface'
          : 'overflow-hidden rounded-xl border border-nativz-border bg-surface'
      }
    >
      {isEditor && (
        <input
          ref={revisionInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadRevisionFile(f);
          }}
        />
      )}
      {withVideoHeader ? (
        <>
          <div className="relative bg-black">
            {post.video_url ? (
              <video
                src={post.video_url}
                controls
                playsInline
                poster={post.cover_image_url ?? undefined}
                className="mx-auto block max-h-[55vh] w-auto"
              />
            ) : (
              <div className="flex aspect-[9/16] max-h-[55vh] w-full items-center justify-center">
                <div className="text-center text-text-muted">
                  <Film className="mx-auto mb-2" size={32} />
                  <p className="text-sm">Video not available</p>
                </div>
              </div>
            )}
            {isEditor && (
              <button
                type="button"
                onClick={() => revisionInputRef.current?.click()}
                disabled={uploadingRevision}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-black/70 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition-opacity hover:bg-black/85 disabled:opacity-60"
              >
                {uploadingRevision ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadingRevision ? 'Uploading…' : 'Replace media'}
              </button>
            )}
          </div>
          <div className="p-3 sm:p-4">{captionBlock}</div>
        </>
      ) : (
        <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={onPlay}
              className="relative aspect-[9/16] w-32 overflow-hidden rounded-lg bg-surface-hover sm:w-44 md:w-52"
            >
              {post.cover_image_url ? (
                <img
                  src={post.cover_image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Film size={32} className="text-text-muted" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
                  <Play size={22} fill="white" className="ml-0.5 text-white" />
                </div>
              </div>
            </button>
            {isEditor && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  revisionInputRef.current?.click();
                }}
                disabled={uploadingRevision}
                className="inline-flex self-center items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
              >
                {uploadingRevision ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadingRevision ? 'Uploading…' : 'Replace media'}
              </button>
            )}
          </div>
          {captionBlock}
        </div>
      )}

      {post.comments.length > 0 && (
        <div className="border-t border-nativz-border bg-background/40 px-3 py-3 sm:px-4">
          <h3 className="mb-2 text-[13px] font-medium text-text-muted">History</h3>
          <div className="space-y-2">
            {post.comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                token={token}
                isEditor={isEditor}
                onDeleted={() => onCommentRemoved(c.id)}
                onUpdated={onCommentUpdated}
              />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-nativz-border px-3 py-3 sm:px-4">
        <h3 className="mb-2 text-[13px] font-medium text-text-muted">Leave feedback</h3>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Notes on the video (cuts, music, hook, etc.)"
          rows={2}
          className="mb-2 w-full resize-none rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          disabled={submitting}
        />

        {pendingAttachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingAttachments.map((a) => (
              <AttachmentChip key={a.url} attachment={a} onRemove={() => removeAttachment(a.url)} />
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />

        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || uploading || pendingAttachments.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {uploading ? 'Uploading…' : 'Attach files'}
          </button>
          <span className="text-xs text-text-muted">up to 25 MB</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {review === 'approved' && latestApprovedId ? (
            <button
              type="button"
              onClick={removeApproval}
              disabled={removingApproval || submitting || uploading}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:py-2"
            >
              {removingApproval ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
              Remove approval
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit('approved')}
              disabled={submitting || uploading}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-accent px-4 py-2.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-accent sm:py-2"
            >
              <CheckCircle size={14} /> Approve
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('changes_requested')}
            disabled={submitting || uploading || (!commentText.trim() && pendingAttachments.length === 0)}
            className="inline-flex items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:py-2"
          >
            <MessageSquare size={14} /> Add revision
          </button>
        </div>
      </div>
    </article>
  );
}

function CommentRow({
  comment,
  token,
  isEditor,
  onDeleted,
  onUpdated,
}: {
  comment: SharedComment;
  token: string;
  isEditor: boolean;
  onDeleted: () => void;
  onUpdated: (comment: SharedComment) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  // metadata.resolved is the editor-set "this revision was handled" flag.
  // Stored in metadata (not a status flip) so the audit thread still groups
  // with other change-request rows but the icon/copy switch to a green check.
  const isResolved =
    comment.status === 'changes_requested' &&
    !!(comment.metadata && (comment.metadata as Record<string, unknown>).resolved);
  // metadata.auto_approved is set by the server when a "love this, change
  // nothing"-style comment was upgraded to an approval — used below to label
  // the row "Auto-approved" rather than just "Approved".
  const wasAutoApproved =
    comment.status === 'approved' &&
    !!(comment.metadata && (comment.metadata as Record<string, unknown>).auto_approved);

  async function toggleResolved() {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, resolved: !isResolved }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update');
      onUpdated(json.comment as SharedComment);
      toast.success(!isResolved ? 'Marked as revised' : 'Reopened revision');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setResolving(false);
    }
  }

  function requestDelete() {
    if (deleting) return;
    let skip = false;
    try {
      skip = typeof window !== 'undefined' && window.localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === '1';
    } catch {
      skip = false;
    }
    if (skip) {
      void doDelete();
    } else {
      setConfirming(true);
    }
  }

  async function doDelete() {
    setConfirming(false);
    setDeleting(true);
    if (dontAsk) {
      try {
        window.localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, '1');
      } catch {
        // ignore storage failures (private mode / disabled storage)
      }
    }
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to remove');
      onDeleted();
      toast.success('Removed from history');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div
        role="alertdialog"
        aria-label="Confirm remove from history"
        className="rounded-lg border border-nativz-border bg-surface px-3 py-2"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <AlertTriangle size={12} className="text-[color:var(--status-danger)]" />
            <span className="text-text-primary">Remove from history?</span>
            <span className="text-text-muted">Can’t be undone.</span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-text-muted select-none">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
                className="h-3 w-3 accent-[color:var(--accent)]"
              />
              Don’t ask again
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex items-center justify-center rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3 py-1 text-[11px] font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doDelete()}
                autoFocus
                className="inline-flex items-center justify-center rounded-[var(--nz-btn-radius)] bg-[color:var(--status-danger)] px-3 py-1 text-[11px] font-medium text-white shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-card-hover)] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--status-danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Editor-only "Mark revised" affordance on a change-request row. After
  // resolving, the same button reopens the row in case the editor flipped
  // it by accident. Visible always (not just on hover) so editors can scan
  // the history and see what's still outstanding.
  const resolveButton =
    comment.status === 'changes_requested' && isEditor ? (
      <button
        type="button"
        onClick={toggleResolved}
        disabled={resolving}
        aria-label={isResolved ? 'Reopen revision' : 'Mark as revised'}
        className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          isResolved
            ? 'bg-status-success/12 text-status-success ring-1 ring-status-success/30 hover:bg-status-success/20'
            : 'bg-surface text-text-secondary ring-1 ring-nativz-border hover:bg-status-success/10 hover:text-status-success hover:ring-status-success/40'
        }`}
        title={isResolved ? 'Click to reopen this revision' : 'Click when this revision is done'}
      >
        {resolving ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <CheckCircle size={11} />
        )}
        {isResolved ? 'Revised' : 'Mark revised'}
      </button>
    ) : null;

  const deleteButton = (
    <button
      type="button"
      onClick={requestDelete}
      disabled={deleting}
      aria-label="Remove from history"
      className={`${resolveButton ? 'ml-1' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 transition hover:bg-status-danger/15 hover:text-status-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {deleting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
    </button>
  );

  const tone = isResolved
    ? 'text-status-success'
    : comment.status === 'approved'
      ? 'text-status-success'
      : comment.status === 'changes_requested'
        ? 'text-status-warning'
        : comment.status === 'caption_edit' || comment.status === 'tag_edit' || comment.status === 'video_revised'
          ? 'text-accent-text'
          : comment.status === 'schedule_change'
            ? 'text-accent-text'
            : 'text-text-secondary';
  const Icon = isResolved
    ? CheckCircle
    : comment.status === 'approved'
      ? CheckCircle
      : comment.status === 'changes_requested'
        ? AlertTriangle
        : comment.status === 'caption_edit'
          ? Type
          : comment.status === 'tag_edit'
            ? AtSign
            : comment.status === 'schedule_change'
              ? Clock
              : comment.status === 'video_revised'
                ? Film
                : MessageSquare;
  const time = new Date(comment.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (comment.status === 'caption_edit') {
    return (
      <div className="group rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-[13px]">
          <Icon size={12} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">edited the caption · {time}</span>
          {deleteButton}
        </div>
        {comment.caption_before && (
          <details className="mb-1.5 text-[12px] text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary">Show previous caption</summary>
            <p className="mt-1 whitespace-pre-wrap rounded border border-nativz-border bg-background/40 px-2 py-1.5 text-text-muted">
              {comment.caption_before || <span className="italic">(empty)</span>}
            </p>
          </details>
        )}
        {comment.caption_after && (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-secondary">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">Now: </span>
            {comment.caption_after}
          </p>
        )}
      </div>
    );
  }

  if (
    comment.status === 'tag_edit' ||
    comment.status === 'schedule_change' ||
    comment.status === 'video_revised'
  ) {
    return (
      <div className="group rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
        <div className="flex items-center gap-2 text-[13px]">
          <Icon size={12} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">{comment.content || activityVerb(comment.status)} · {time}</span>
          {deleteButton}
        </div>
      </div>
    );
  }

  // Default branch covers `comment`, `approved`, and `changes_requested`. The
  // last one is the row that gets the resolveButton + green tint when an
  // editor marks it done — visible to the client too so they know the revision
  // landed.
  const containerClass =
    isResolved
      ? 'group rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2'
      : comment.status === 'changes_requested'
        ? 'group rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2'
        : 'group rounded-lg border border-nativz-border bg-surface px-3 py-2';
  const trailingMeta =
    comment.status === 'approved' && wasAutoApproved
      ? 'auto-approved · '
      : isResolved
        ? 'marked revised · '
        : '';
  return (
    <div className={containerClass}>
      <div className="mb-1 flex items-center gap-2 text-[13px]">
        <Icon size={12} className={tone} />
        <span className="font-medium text-text-primary">{comment.author_name}</span>
        <span className="text-text-muted">· {trailingMeta}{time}</span>
        {resolveButton}
        {deleteButton}
      </div>
      {comment.content && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-secondary">{comment.content}</p>
      )}
      {comment.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {comment.attachments.map((a) => (
            <CommentAttachmentTile key={a.url} attachment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function activityVerb(status: SharedCommentStatus): string {
  switch (status) {
    case 'tag_edit':
      return 'updated tags';
    case 'schedule_change':
      return 'changed the schedule';
    case 'video_revised':
      return 're-uploaded the video';
    default:
      return '';
  }
}

function SchedulePill({
  scheduledAt,
  scheduledLabel,
  isPublished,
  defaultPostTime,
  open,
  onOpenChange,
  saving,
  onSave,
}: {
  scheduledAt: string | null;
  scheduledLabel: string;
  isPublished: boolean;
  defaultPostTime: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSave: (nextAt: string | null) => void;
}) {
  const initial = scheduledAt ? toLocalDatetimeInput(scheduledAt) : suggestedDatetimeInput(defaultPostTime);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(scheduledAt ? toLocalDatetimeInput(scheduledAt) : suggestedDatetimeInput(defaultPostTime));
  }, [scheduledAt, defaultPostTime]);

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={isPublished}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
          isPublished
            ? 'bg-surface-hover text-text-muted'
            : 'bg-accent-surface text-accent-text ring-1 ring-accent/40 hover:bg-accent/15 hover:ring-accent'
        }`}
        title={isPublished ? 'Already published — date is locked' : 'Change scheduled date'}
        aria-label={isPublished ? `Scheduled ${scheduledLabel}` : `Scheduled ${scheduledLabel} — tap to change`}
      >
        <Clock size={13} /> {scheduledLabel}
        {!isPublished && (
          <span className="ml-0.5 inline-flex items-center gap-0.5 border-l border-accent/30 pl-1.5 text-[12px]">
            <Pencil size={11} /> Change
          </span>
        )}
      </button>
      {open && !isPublished && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[280px] rounded-lg border border-nativz-border bg-surface p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-medium text-text-muted">Move post to</p>
          <input
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mb-2 w-full rounded-md border border-nativz-border bg-transparent px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSave(null)}
              disabled={saving || !scheduledAt}
              className="inline-flex items-center gap-1 rounded-md border border-nativz-border bg-transparent px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
            >
              Unschedule
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="rounded-md border border-nativz-border bg-transparent px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!draft) return;
                  onSave(new Date(draft).toISOString());
                }}
                disabled={saving || !draft}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

function HandleEditor({
  label,
  icon: Icon,
  placeholder,
  handles,
  disabled,
  onAdd,
  onRemove,
  requireName,
  hasName,
}: {
  label: string;
  icon: typeof Tag;
  placeholder: string;
  handles: string[];
  disabled: boolean;
  onAdd: (h: string) => void | Promise<void>;
  onRemove: (h: string) => void | Promise<void>;
  requireName: () => void;
  hasName: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    const cleaned = draft.trim().replace(/^@+/, '');
    if (!cleaned) return;
    onAdd(cleaned);
    setDraft('');
    setAdding(false);
  }

  if (handles.length === 0 && !adding) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Icon size={14} />
        <span>{label}:</span>
        <button
          type="button"
          onClick={() => {
            if (!hasName) {
              requireName();
              return;
            }
            setAdding(true);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-dashed border-nativz-border px-2.5 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <Icon size={14} /> {label}:
      </span>
      {handles.map((h) => (
        <span
          key={h}
          className="group inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-2.5 py-1 text-accent-text"
        >
          @{h}
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(h)}
              className="rounded-full p-0.5 text-accent-text/70 transition-colors hover:bg-accent/15 hover:text-accent-text"
              aria-label={`Remove ${h}`}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/40 px-2 py-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            placeholder={placeholder}
            autoFocus
            className="w-28 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            className="rounded-full p-0.5 text-accent-text transition-colors hover:bg-accent/15"
            aria-label="Add"
          >
            <CheckCircle size={13} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!hasName) {
              requireName();
              return;
            }
            setAdding(true);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-nativz-border px-2.5 py-1 text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

function NotifyRevisionsToast({
  token,
  count,
  onDone,
}: {
  token: string;
  count: number;
  onDone: (didNotify: boolean) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<'notify' | 'skip' | null>(null);

  async function call(action: 'notify' | 'skip') {
    setBusy(action);
    try {
      const res = await fetch(`/api/calendar/share/${token}/notify-revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed');
      if (action === 'notify') toast.success('Client notified');
      await onDone(action === 'notify');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-accent/40 bg-surface p-4 shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface text-accent-text">
          <BellRing size={14} />
        </span>
        <h4 className="font-display text-sm font-semibold text-text-primary">
          {count} revised {count === 1 ? 'video' : 'videos'} ready
        </h4>
      </div>
      <p className="mb-3 text-xs text-text-secondary">
        Notify the client to take another look at the new {count === 1 ? 'cut' : 'cuts'}?
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => call('skip')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {busy === 'skip' ? <Loader2 size={11} className="animate-spin" /> : null}
          Skip
        </button>
        <button
          type="button"
          onClick={() => call('notify')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'notify' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Notify client
        </button>
      </div>
    </div>
  );
}

function sortPostsForList(posts: SharedPost[]): SharedPost[] {
  return [...posts].sort((a, b) => {
    if (!a.scheduled_at && !b.scheduled_at) return 0;
    if (!a.scheduled_at) return -1;
    if (!b.scheduled_at) return 1;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function suggestedDatetimeInput(defaultPostTime: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const [hh = '12', mm = '00'] = (defaultPostTime ?? '12:00').split(':');
  d.setHours(Number(hh), Number(mm), 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: CommentAttachment;
  onRemove: () => void;
}) {
  const isImage = attachment.mime_type.startsWith('image/');
  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-nativz-border bg-background/40 py-1 pl-1 pr-7 text-xs text-text-secondary">
      {isImage ? (
        <img src={attachment.url} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-hover">
          <FileIcon size={14} className="text-text-muted" />
        </div>
      )}
      <span className="max-w-[160px] truncate">{attachment.filename}</span>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
        aria-label={`Remove ${attachment.filename}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function CommentAttachmentTile({ attachment }: { attachment: CommentAttachment }) {
  const isImage = attachment.mime_type.startsWith('image/');
  const isVideo = attachment.mime_type.startsWith('video/');
  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-md border border-nativz-border bg-background/40"
      >
        <img src={attachment.url} alt={attachment.filename} className="h-24 w-24 object-cover" />
      </a>
    );
  }
  if (isVideo) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-md border border-nativz-border bg-background/40"
      >
        <video src={attachment.url} className="h-24 w-24 object-cover" muted playsInline />
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border bg-background/40 px-2 py-1.5 text-xs text-accent-text transition-colors hover:bg-surface-hover"
    >
      <FileIcon size={12} />
      <span className="max-w-[180px] truncate">{attachment.filename}</span>
    </a>
  );
}
