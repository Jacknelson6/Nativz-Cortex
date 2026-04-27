'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CalendarDays, CheckCircle, Clock, File as FileIcon,
  Film, List, Loader2, MessageSquare, Paperclip, Pencil, Play, Type, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';

interface CommentAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

interface SharedComment {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment' | 'caption_edit';
  created_at: string;
  attachments: CommentAttachment[];
  caption_before: string | null;
  caption_after: string | null;
}

interface SharedPost {
  id: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  video_url: string | null;
  comments: SharedComment[];
}

interface SharedDrop {
  clientName: string;
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
  const storageKey = `cortex_share_name_${token}`;
  const [authorName, setAuthorName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [playingPost, setPlayingPost] = useState<SharedPost | null>(null);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-text-primary sm:text-xl">
                {data.clientName} — Content calendar
              </h1>
              <p className="mt-1 text-xs text-text-secondary sm:text-sm">
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
                  className="rounded-lg border border-nativz-border bg-transparent px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover"
                  title="Change name"
                >
                  {authorName}
                </button>
              )}
              <div className="inline-flex overflow-hidden rounded-lg border border-nativz-border">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
                    viewMode === 'list'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                  aria-label="List view"
                >
                  <List size={12} /> <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`inline-flex items-center gap-1.5 border-l border-nativz-border px-2.5 py-1.5 text-xs transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                  aria-label="Calendar view"
                >
                  <CalendarDays size={12} /> <span className="hidden sm:inline">Calendar</span>
                </button>
              </div>
            </div>
          </div>
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

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {viewMode === 'list' ? (
          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
            {data.posts.map((post, idx) => (
              <PostCard
                key={post.id}
                index={idx + 1}
                post={post}
                token={token}
                authorName={authorName}
                onCommentAdded={(c) => appendComment(post.id, c)}
                onCaptionUpdated={(caption, c) => updatePostCaption(post.id, caption, c)}
                onPlay={() => setPlayingPost(post)}
                requireName={() => {
                  setPendingName(authorName);
                  setNameModalOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <CalendarGrid posts={data.posts} drop={data.drop} onSelect={(p) => setPlayingPost(p)} />
        )}
      </main>

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
          <h2 className="text-lg font-semibold text-text-primary">Welcome</h2>
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
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text sm:text-sm"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => saveName(pendingName)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-text px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      </Dialog>

      <VideoPlayerModal post={playingPost} onClose={() => setPlayingPost(null)} />
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

function VideoPlayerModal({ post, onClose }: { post: SharedPost | null; onClose: () => void }) {
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
            src={post.video_url}
            controls
            autoPlay
            playsInline
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
              ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-text font-semibold text-white'
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
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                <Play size={14} className="text-white opacity-0 group-hover:opacity-100" fill="white" />
              </div>
            )}
            {review === 'approved' && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-emerald-600 p-0.5">
                <CheckCircle size={9} className="text-white" />
              </span>
            )}
            {review === 'changes_requested' && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-500 p-0.5">
                <AlertTriangle size={9} className="text-white" />
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
  token,
  authorName,
  onCommentAdded,
  onCaptionUpdated,
  onPlay,
  requireName,
}: {
  index: number;
  post: SharedPost;
  token: string;
  authorName: string;
  onCommentAdded: (c: SharedComment) => void;
  onCaptionUpdated: (caption: string, c: SharedComment) => void;
  onPlay: () => void;
  requireName: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(post.caption);
  const [savingCaption, setSavingCaption] = useState(false);

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
    if (status === 'comment' && !commentText.trim() && pendingAttachments.length === 0) {
      toast.error('Please enter a comment or attach a file');
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
          attachments: pendingAttachments,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      onCommentAdded(json.comment as SharedComment);
      setCommentText('');
      setPendingAttachments([]);
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
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4 md:flex-row">
        <div className="shrink-0">
          <button
            type="button"
            onClick={onPlay}
            disabled={!post.video_url}
            className="group relative aspect-[9/16] w-24 overflow-hidden rounded-lg bg-surface-hover sm:w-32 md:w-36 disabled:cursor-default"
          >
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
            {post.video_url && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 sm:h-10 sm:w-10">
                  <Play size={16} fill="black" className="ml-0.5 text-black sm:hidden" />
                  <Play size={18} fill="black" className="ml-0.5 hidden text-black sm:block" />
                </div>
              </div>
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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

          {editingCaption ? (
            <div className="space-y-2">
              <textarea
                value={draftCaption}
                onChange={(e) => setDraftCaption(e.target.value)}
                rows={Math.max(3, Math.min(10, draftCaption.split('\n').length + 1))}
                disabled={savingCaption}
                autoFocus
                className="w-full resize-none rounded-lg border border-accent-text/40 bg-background/60 px-3 py-2 text-base leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text sm:text-sm"
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-text px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {savingCaption ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  Save caption
                </button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              <p className="whitespace-pre-wrap pr-10 text-sm leading-relaxed text-text-primary">
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
                <span key={h} className="text-xs text-accent-text">
                  #{h}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {post.comments.length > 0 && (
        <div className="border-t border-nativz-border bg-background/40 px-3 py-3 sm:px-4">
          <h3 className="mb-2 text-xs font-medium text-text-muted">Comments</h3>
          <div className="space-y-2">
            {post.comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-nativz-border px-3 py-3 sm:px-4">
        <h3 className="text-xs font-medium text-text-muted">Leave feedback</h3>
        <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-text-muted">
          Use comments for video revisions. To change the caption, edit it directly above.
        </p>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Notes on the video (cuts, music, hook, etc.)"
          rows={2}
          className="mb-2 w-full resize-none rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text sm:text-sm"
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

        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || uploading || pendingAttachments.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-transparent px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {uploading ? 'Uploading…' : 'Attach files'}
          </button>
          <span className="text-[10px] text-text-muted">images, video, pdf · 25 MB</span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => submit('approved')}
            disabled={submitting || uploading}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:py-1.5"
          >
            <CheckCircle size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => submit('changes_requested')}
            disabled={submitting || uploading}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50 sm:py-1.5"
          >
            <AlertTriangle size={12} /> Changes
          </button>
          <button
            type="button"
            onClick={() => submit('comment')}
            disabled={submitting || uploading || (!commentText.trim() && pendingAttachments.length === 0)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50 sm:py-1.5"
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
        <div className="mb-1 flex items-center gap-2 text-xs">
          <Icon size={11} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">edited the caption · {time}</span>
        </div>
        {comment.caption_before && (
          <details className="mb-1.5 text-[11px] text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary">Show previous caption</summary>
            <p className="mt-1 whitespace-pre-wrap rounded border border-nativz-border bg-background/40 px-2 py-1.5 text-text-muted">
              {comment.caption_before || <span className="italic">(empty)</span>}
            </p>
          </details>
        )}
        {comment.caption_after && (
          <p className="whitespace-pre-wrap text-sm text-text-secondary">
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
      {comment.content && (
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{comment.content}</p>
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
