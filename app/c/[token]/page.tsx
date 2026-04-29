'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, AtSign, BellRing, CalendarDays, CheckCircle, Clock,
  File as FileIcon, Film, List, Loader2, MapPin, MessageSquare, Paperclip, Pencil, Play,
  Plus, Send, Tag, Type, Undo2, Upload, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

// Mux Player is a heavy web-component-backed React component. Dynamic-import
// with ssr:false keeps it out of the initial server bundle and avoids
// hydration warnings from the underlying custom element.
const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), { ssr: false });

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
  // Anchored timestamp inside the post's video (seconds, fractional). Null
  // for general comments. Click on the chip seeks the player.
  timestamp_seconds: number | null;
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
  // Mux fields land once a Mux upload exists for this post. While we still
  // support legacy <video src=revised_video_url> for older uploads, the
  // share page picks Mux when mux_playback_id is present.
  mux_playback_id: string | null;
  mux_status: string | null;
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
    revision: {
      revised_video_url: string | null;
      revised_video_uploaded_at: string;
      revised_video_notify_pending: boolean;
      mux_playback_id?: string | null;
      mux_status?: string | null;
    },
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    // For Mux uploads we don't have a playback URL yet — clear
                    // video_url so the UI shows a "processing" state until the
                    // ready webhook lands. For legacy uploads (revised_video_url
                    // is the actual URL) we still populate video_url.
                    video_url: revision.revised_video_url ?? p.video_url,
                    revised_video_url: revision.revised_video_url,
                    revised_video_uploaded_at: revision.revised_video_uploaded_at,
                    revised_video_notify_pending: revision.revised_video_notify_pending,
                    mux_playback_id: revision.mux_playback_id ?? p.mux_playback_id,
                    mux_status: revision.mux_status ?? p.mux_status,
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
          <CalendarGrid
            posts={sortedPosts}
            drop={data.drop}
            token={token}
            authorName={authorName}
            defaultPostTime={data.drop.default_post_time}
            onSelect={(p) => setDetailPostId(p.id)}
            onScheduleUpdated={updatePostScheduledAt}
            requireName={() => {
              setPendingName(authorName);
              setNameModalOpen(true);
            }}
          />
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

/**
 * Renders the right player for a post, in priority order:
 *   1. Mux: if mux_playback_id is set, use <MuxPlayer> (HLS, adaptive
 *      bitrate, brand-color accent).
 *   2. Processing: if Mux is still packaging (mux_status='processing' or
 *      'uploading'), show a friendly "Processing the new cut…" placeholder
 *      so editors know the upload landed but they should refresh shortly.
 *   3. Legacy: fall back to <video src=video_url> for older Supabase Storage
 *      uploads that haven't been re-uploaded through Mux yet.
 *   4. Empty: nothing to show.
 *
 * Click-to-seek for timestamped comments will hook into this component
 * via the optional `playerRef` in Phase 4.
 */
type VideoSurfacePost = Pick<
  SharedPost,
  'mux_playback_id' | 'mux_status' | 'video_url' | 'cover_image_url'
>;

/**
 * Tiny shape we expose upward from VideoSurface so timestamped-comment
 * features (anchor, click-to-seek) can drive whichever player is mounted.
 * MuxPlayer's element behaves like an HTMLVideoElement (currentTime setter +
 * play()), so we can hand back the same closures regardless of branch.
 */
export interface PlayerHandle {
  getCurrentTime: () => number;
  seek: (seconds: number) => void;
}

interface PlayerLikeElement {
  currentTime: number;
  play?: () => Promise<void> | void;
}

function makePlayerHandle(el: PlayerLikeElement): PlayerHandle {
  return {
    getCurrentTime: () => el.currentTime || 0,
    seek: (seconds) => {
      try {
        el.currentTime = Math.max(0, seconds);
        // Best-effort resume — promise rejects on autoplay policy violations,
        // which are fine to swallow (the user clicked, so a play() following
        // a click should usually go through; if not, the seek already moved
        // the playhead and the user can hit play themselves).
        const playResult = el.play?.();
        if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
          (playResult as Promise<void>).catch(() => {});
        }
      } catch {
        // Player may not be ready yet — silently no-op.
      }
    },
  };
}

function formatSeconds(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoSurface({
  post,
  controls = true,
  autoPlay = false,
  className,
  onPlayerReady,
}: {
  post: VideoSurfacePost;
  controls?: boolean;
  autoPlay?: boolean | 'muted' | 'any';
  className?: string;
  // Handed a handle when the underlying media element mounts, and `null`
  // when it unmounts. Optional — most callers (calendar grid thumbs, lightbox)
  // don't need to seek into the player.
  onPlayerReady?: (handle: PlayerHandle | null) => void;
}) {
  // Single ref callback shared across the Mux + legacy branches so the
  // PlayerHandle wiring is identical. We treat MuxPlayerElement structurally
  // as a PlayerLikeElement (it exposes `currentTime` + `play()` like a video).
  const attachPlayer = (el: unknown) => {
    if (!onPlayerReady) return;
    if (el && typeof el === 'object' && 'currentTime' in (el as Record<string, unknown>)) {
      onPlayerReady(makePlayerHandle(el as PlayerLikeElement));
    } else {
      onPlayerReady(null);
    }
  };

  if (post.mux_playback_id) {
    return (
      <MuxPlayer
        // MuxPlayer's ref points at the <mux-player> custom element, which
        // mirrors HTMLVideoElement enough for currentTime/play().
        ref={attachPlayer as never}
        streamType="on-demand"
        playbackId={post.mux_playback_id}
        autoPlay={autoPlay}
        accentColor="var(--accent)"
        poster={post.cover_image_url ?? undefined}
        // 9:16 short-form video — keep aspect ratio while fitting parent.
        style={{ aspectRatio: '9 / 16', maxHeight: 'inherit', width: '100%' }}
        className={className}
        // Disable Mux's default end-screen + remote playback chrome — keeps
        // the share-link surface focused on review, not branded promo.
        metadata={{ player_name: 'cortex-share' }}
      />
    );
  }
  if (post.mux_status === 'processing' || post.mux_status === 'uploading') {
    return (
      <div className={`flex aspect-[9/16] w-full items-center justify-center ${className ?? ''}`}>
        <div className="text-center text-text-muted">
          <Loader2 className="mx-auto mb-2 animate-spin" size={32} />
          <p className="text-sm">Processing the new cut…</p>
          <p className="mt-1 text-[11px]">Usually takes about a minute. Refresh to check.</p>
        </div>
      </div>
    );
  }
  if (post.video_url) {
    return (
      <video
        ref={attachPlayer as never}
        src={post.video_url}
        controls={controls}
        playsInline
        preload="auto"
        autoPlay={autoPlay === true || autoPlay === 'any' || autoPlay === 'muted'}
        muted={autoPlay === 'muted'}
        poster={post.cover_image_url ?? undefined}
        className={className}
      />
    );
  }
  return (
    <div className={`flex aspect-[9/16] w-full items-center justify-center ${className ?? ''}`}>
      <div className="text-center text-text-muted">
        <Film className="mx-auto mb-2" size={32} />
        <p className="text-sm">Video not available</p>
      </div>
    </div>
  );
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
        {/* autoPlay="any" lets MuxPlayer (and our legacy <video> branch via
            VideoSurface) try unmuted then fall back to muted on mobile
            Safari — same behavior the previous useEffect was doing manually. */}
        <VideoSurface
          post={post}
          autoPlay="any"
          className="mx-auto block max-h-[80vh] w-auto"
        />
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
    rev: {
      revised_video_url: string | null;
      revised_video_uploaded_at: string;
      revised_video_notify_pending: boolean;
      mux_playback_id?: string | null;
      mux_status?: string | null;
    },
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
  token,
  authorName,
  defaultPostTime,
  onSelect,
  onScheduleUpdated,
  requireName,
}: {
  posts: SharedPost[];
  drop: SharedDrop['drop'];
  token: string;
  authorName: string;
  defaultPostTime: string;
  onSelect: (post: SharedPost) => void;
  onScheduleUpdated: (postId: string, nextAt: string | null, c: SharedComment | null) => void;
  requireName: () => void;
}) {
  const { weeks, monthLabel } = useMemo(() => buildCalendarWeeks(posts, drop), [posts, drop]);
  // Lifted drag state — the cell renders a different border treatment when
  // it's the source vs an active drop target. Using state here (instead of
  // dataTransfer-only) gives us a hover-feedback frame across the grid.
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const postsById = useMemo(() => {
    const map: Record<string, SharedPost> = {};
    for (const p of posts) map[p.id] = p;
    return map;
  }, [posts]);

  async function movePostToDate(postId: string, target: Date) {
    if (moving) return;
    if (!authorName.trim()) {
      requireName();
      return;
    }
    const post = postsById[postId];
    if (!post) return;
    const isPublished =
      post.status === 'published' || post.status === 'publishing' || post.status === 'partially_failed';
    if (isPublished) {
      toast.error('Already published — date is locked');
      return;
    }
    // Preserve the post's original time-of-day on the new date — falling back
    // to the drop's default_post_time when the post was previously
    // unscheduled (which can't actually drag from the calendar today, but
    // we keep the branch for future drag-from-list-into-calendar flows).
    const scheduledAt = buildScheduledAtForDate(target, post.scheduled_at, defaultPostTime);
    const targetIso = scheduledAt;
    setMoving(true);
    // Optimistic local update — the parent's setData runs through
    // onScheduleUpdated below, so we can roll back if the server rejects.
    const previousIso = post.scheduled_at;
    onScheduleUpdated(postId, new Date(targetIso).toISOString(), null);
    try {
      const res = await fetch(`/api/calendar/share/${token}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          authorName: authorName.trim(),
          scheduledAt: targetIso,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update date');
      }
      onScheduleUpdated(
        postId,
        (json.scheduledAt as string | null) ?? null,
        (json.comment as SharedComment | null) ?? null,
      );
      toast.success('Date updated');
    } catch (err) {
      // Roll back the optimistic move on failure.
      onScheduleUpdated(postId, previousIso, null);
      toast.error(err instanceof Error ? err.message : 'Failed to update date');
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-2 sm:p-4">
      <h2 className="mb-2 px-1 text-sm font-medium text-text-primary sm:mb-3 sm:px-0">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted sm:gap-1 sm:text-[11px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {weeks.flat().map((cell, idx) => {
          const key = ymdKey(cell.date);
          return (
            <CalendarCell
              key={idx}
              cell={cell}
              isDragOver={dragOverKey === key && !!draggingPostId}
              draggingPostId={draggingPostId}
              onSelect={onSelect}
              onDragStart={(postId) => setDraggingPostId(postId)}
              onDragEnd={() => {
                setDraggingPostId(null);
                setDragOverKey(null);
              }}
              onDragOver={() => setDragOverKey(key)}
              onDragLeave={() => {
                setDragOverKey((curr) => (curr === key ? null : curr));
              }}
              onDrop={(postId) => {
                setDragOverKey(null);
                setDraggingPostId(null);
                // Don't fire if the user dropped on the same day they
                // started from — pointless and would still log a comment.
                const post = postsById[postId];
                if (post?.scheduled_at && isSameDay(new Date(post.scheduled_at), cell.date)) return;
                void movePostToDate(postId, cell.date);
              }}
            />
          );
        })}
      </div>
      {/* Subtle hint so first-time users discover the affordance — only
          renders when there's at least one schedulable post and an admin
          isn't already dragging. */}
      <p className="mt-2 px-1 text-[11px] text-text-muted sm:px-0">
        Drag a post to a different day to reschedule.
      </p>
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
  isDragOver,
  draggingPostId,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  cell: CalendarCell;
  isDragOver: boolean;
  draggingPostId: string | null;
  onSelect: (post: SharedPost) => void;
  onDragStart: (postId: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (postId: string) => void;
}) {
  const isToday = isSameDay(cell.date, new Date());
  const post = cell.posts[0] ?? null;
  const review = post ? latestReview(post.comments) : null;
  const isPublished = post
    ? post.status === 'published' || post.status === 'publishing' || post.status === 'partially_failed'
    : false;
  const isDraggable = !!post && !isPublished;
  const isSourceCell = !!post && post.id === draggingPostId;

  // Visual treatment:
  //   - draggable cells with a post: full-bleed 9:16 thumbnail
  //   - empty in-month cells: thin border, day number top-left
  //   - out-of-month padding cells: transparent
  const baseClass = `relative aspect-[9/16] overflow-hidden rounded-md border transition-all ${
    cell.inMonth
      ? isDragOver
        ? 'border-accent ring-2 ring-accent/40 bg-accent-surface'
        : 'border-nativz-border bg-background/40'
      : 'border-transparent bg-transparent'
  }`;

  return (
    <div
      className={baseClass}
      onDragOver={(e) => {
        // preventDefault is mandatory to mark a drop target as valid.
        if (!draggingPostId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const postId = e.dataTransfer.getData('text/plain');
        if (postId) onDrop(postId);
      }}
    >
      {post ? (
        <button
          type="button"
          onClick={() => onSelect(post)}
          draggable={isDraggable}
          onDragStart={(e) => {
            if (!isDraggable) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', post.id);
            onDragStart(post.id);
          }}
          onDragEnd={onDragEnd}
          className={`group absolute inset-0 block w-full overflow-hidden bg-surface-hover transition-transform ${
            isSourceCell ? 'opacity-40' : 'hover:scale-[1.02]'
          } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
          title={post.caption.slice(0, 80)}
        >
          {post.cover_image_url ? (
            <img
              src={post.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film size={18} className="text-text-muted" />
            </div>
          )}
          {post.video_url && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 shadow ring-1 ring-white/20 backdrop-blur-sm">
                <Play size={11} className="ml-px text-white" fill="white" />
              </div>
            </div>
          )}
          {review === 'approved' && (
            <span className="absolute right-1 top-1 rounded-full bg-status-success p-0.5">
              <CheckCircle size={10} className="text-accent-contrast" />
            </span>
          )}
          {review === 'changes_requested' && (
            <span className="absolute right-1 top-1 rounded-full bg-status-warning p-0.5">
              <AlertTriangle size={10} className="text-accent-contrast" />
            </span>
          )}
          {/* Day number overlays the thumbnail in a translucent black chip so
              it stays legible against any cover image. */}
          <span
            className={`absolute left-1 top-1 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
              isToday
                ? 'bg-accent text-accent-contrast'
                : 'bg-black/55 text-white backdrop-blur-sm'
            }`}
          >
            {cell.date.getDate()}
          </span>
          {cell.posts.length > 1 && (
            <span className="absolute right-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              +{cell.posts.length - 1}
            </span>
          )}
        </button>
      ) : (
        // Empty cell — day number top-left in muted color. Drop target still
        // active because the parent <div> handles dragover/drop.
        <span
          className={`absolute left-1 top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] ${
            isToday
              ? 'bg-accent font-semibold text-accent-contrast'
              : cell.inMonth
                ? 'text-text-secondary'
                : 'text-text-muted/40'
          }`}
        >
          {cell.date.getDate()}
        </span>
      )}
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
    revised_video_url: string | null;
    revised_video_uploaded_at: string;
    revised_video_notify_pending: boolean;
    mux_playback_id?: string | null;
    mux_status?: string | null;
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
  // 0–100 once we start the actual PUT to Mux. Lets the button render
  // "Uploading… 42%" instead of a static spinner — important now that we
  // bypass Vercel and the request can run for many minutes on a big file.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const revisionInputRef = useRef<HTMLInputElement>(null);
  // Player + timestamped-comment plumbing. The ref is set when VideoSurface
  // mounts a player (only in the inline `withVideoHeader` mode); when it's
  // null, we hide the anchor button and timestamp pills are non-interactive.
  const playerHandleRef = useRef<PlayerHandle | null>(null);
  const videoSectionRef = useRef<HTMLDivElement | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [anchorSeconds, setAnchorSeconds] = useState<number | null>(null);

  function captureAnchor() {
    const t = playerHandleRef.current?.getCurrentTime() ?? 0;
    setAnchorSeconds(Math.max(0, Math.floor(t)));
  }

  function clearAnchor() {
    setAnchorSeconds(null);
  }

  function seekTo(seconds: number) {
    const handle = playerHandleRef.current;
    if (!handle) return;
    handle.seek(seconds);
    // Bring the player into view if the user scrolled past it inside the
    // modal — the comment they clicked is below the fold most of the time.
    videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
          // Server only honors this for `comment` / `changes_requested`; the
          // approval path strips it. Sending unconditionally keeps the
          // client free of duplicate "should I include this?" branching.
          timestampSeconds: anchorSeconds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      const savedComment = json.comment as SharedComment;
      onCommentAdded(savedComment);
      setCommentText('');
      setPendingAttachments([]);
      setAnchorSeconds(null);
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
    setUploadProgress(0);
    try {
      // 1. Mint a Mux direct-upload URL on the server. This persists the
      //    upload id on the row so the webhook can match it back.
      const initRes = await fetch(
        `/api/calendar/share/${token}/revision/${post.id}/mux-upload`,
        { method: 'POST' },
      );
      const initJson = await initRes.json().catch(() => null);
      if (!initRes.ok || !initJson?.uploadUrl) {
        throw new Error(
          typeof initJson?.error === 'string' ? initJson.error : 'Could not start upload',
        );
      }
      const uploadUrl = initJson.uploadUrl as string;
      const uploadId = initJson.uploadId as string;

      // 2. PUT the bytes directly to Mux's signed URL via XHR so we get
      //    progress events. Fetch's streams API doesn't expose upload
      //    progress in browsers, so XHR is still the right tool here.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Mux upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.send(file);
      });

      // 3. Tell our server the upload finished so it can stamp the row.
      //    The actual playback id arrives later via the asset.ready webhook.
      const finRes = await fetch(
        `/api/calendar/share/${token}/revision/${post.id}/mux-finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId }),
        },
      );
      const finJson = await finRes.json().catch(() => null);
      if (!finRes.ok) {
        throw new Error(
          typeof finJson?.error === 'string' ? finJson.error : 'Finalize failed',
        );
      }

      onRevisionUploaded({
        // No playback URL yet — Mux is processing. The UI will show a
        // "Processing…" state until the share endpoint reflects the
        // playback id (next mount or refresh).
        revised_video_url: null,
        revised_video_uploaded_at: finJson.uploaded_at as string,
        revised_video_notify_pending: true,
        mux_status: 'processing',
      });
      toast.success('Upload complete — Mux is processing the cut');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingRevision(false);
      setUploadProgress(null);
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
          <div ref={videoSectionRef} className="relative bg-black">
            <VideoSurface
              post={post}
              className="mx-auto block max-h-[55vh] w-auto"
              onPlayerReady={(handle) => {
                playerHandleRef.current = handle;
                setPlayerReady(!!handle);
              }}
            />
            {isEditor && (
              <button
                type="button"
                onClick={() => revisionInputRef.current?.click()}
                disabled={uploadingRevision}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-black/70 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition-opacity hover:bg-black/85 disabled:opacity-60"
              >
                {uploadingRevision ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadingRevision
                  ? uploadProgress !== null
                    ? `Uploading… ${uploadProgress}%`
                    : 'Uploading…'
                  : 'Replace media'}
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
                {uploadingRevision
                  ? uploadProgress !== null
                    ? `Uploading… ${uploadProgress}%`
                    : 'Uploading…'
                  : 'Replace media'}
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
                onSeek={playerReady ? seekTo : undefined}
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

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || uploading || pendingAttachments.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {uploading ? 'Uploading…' : 'Attach files'}
          </button>
          {/* Anchor toggle — only meaningful when an inline player is mounted
              (modal/withVideoHeader view). When `anchorSeconds` is null we
              show a "Pin to current time" affordance; once set, the chip
              displays the time + a clear button. */}
          {playerReady && (
            anchorSeconds === null ? (
              <button
                type="button"
                onClick={captureAnchor}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                title="Anchor this comment to the current moment in the video"
              >
                <MapPin size={14} /> Pin to current time
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-3 py-1.5 text-sm font-medium text-accent-text ring-1 ring-accent/40">
                <MapPin size={13} />
                Pinned at {formatSeconds(anchorSeconds)}
                <button
                  type="button"
                  onClick={clearAnchor}
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-accent/20"
                  aria-label="Remove pin"
                  title="Remove pin"
                >
                  <X size={11} />
                </button>
              </span>
            )
          )}
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
  onSeek,
}: {
  comment: SharedComment;
  token: string;
  isEditor: boolean;
  onDeleted: () => void;
  onUpdated: (comment: SharedComment) => void;
  // When provided, the timestamp pill becomes clickable and seeks the
  // shared player. Undefined for list-view rows where there's no inline
  // player to drive (the user opens the lightbox instead).
  onSeek?: (seconds: number) => void;
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
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
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

  // Two flavors of the delete button: the inline header version (hover-only,
  // for low-stakes comment/approved rows) and the footer version (always
  // visible, paired with Mark revised on changes_requested rows so editors
  // never have to hover to find the controls on the row that matters).
  const headerDeleteButton = (
    <button
      type="button"
      onClick={requestDelete}
      disabled={deleting}
      aria-label="Remove from history"
      className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 transition hover:bg-status-danger/15 hover:text-status-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {deleting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
    </button>
  );
  const footerDeleteButton = (
    <button
      type="button"
      onClick={requestDelete}
      disabled={deleting}
      aria-label="Remove from history"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-nativz-border transition hover:bg-status-danger/10 hover:text-status-danger hover:ring-status-danger/40 disabled:cursor-not-allowed disabled:opacity-50"
      title="Remove this comment from history"
    >
      {deleting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
      Remove
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
          {headerDeleteButton}
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
          {headerDeleteButton}
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
  // changes_requested rows get a persistent footer with Mark revised + Remove
  // pinned to the bottom — editors don't have to hover to act on the row that
  // matters most. Other rows (comment / approved) keep the lighter
  // hover-revealed delete button in the header.
  const isChangesRequestedRow = comment.status === 'changes_requested';
  // Timestamp pill — only renders on `comment` / `changes_requested` rows
  // since approval rows aren't anchored. When an `onSeek` callback is wired
  // (modal view with a live player), the pill is clickable and jumps the
  // playhead; otherwise it's a static label.
  const timestampPill =
    comment.timestamp_seconds !== null &&
    (comment.status === 'comment' || comment.status === 'changes_requested') ? (
      <button
        type="button"
        onClick={onSeek ? () => onSeek(comment.timestamp_seconds as number) : undefined}
        disabled={!onSeek}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-accent/30 ${
          onSeek
            ? 'cursor-pointer bg-accent-surface text-accent-text transition-colors hover:bg-accent/15 hover:ring-accent'
            : 'cursor-default bg-accent-surface/70 text-accent-text/80'
        }`}
        title={onSeek ? `Jump to ${formatSeconds(comment.timestamp_seconds)} in the video` : `Pinned at ${formatSeconds(comment.timestamp_seconds)}`}
        aria-label={onSeek ? `Jump to ${formatSeconds(comment.timestamp_seconds)} in the video` : `Pinned at ${formatSeconds(comment.timestamp_seconds)}`}
      >
        <MapPin size={10} />
        {formatSeconds(comment.timestamp_seconds)}
      </button>
    ) : null;
  return (
    <div className={containerClass}>
      <div className="mb-1 flex items-center gap-2 text-[13px]">
        <Icon size={12} className={tone} />
        <span className="font-medium text-text-primary">{comment.author_name}</span>
        <span className="text-text-muted">· {trailingMeta}{time}</span>
        {timestampPill}
        {!isChangesRequestedRow && headerDeleteButton}
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
      {isChangesRequestedRow && (
        <div className="mt-2 flex items-center justify-end gap-2 border-t border-nativz-border/60 pt-2">
          {resolveButton}
          {footerDeleteButton}
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

/**
 * Combine a target calendar day with the post's existing time-of-day (or the
 * drop's default_post_time when the post was previously unscheduled) into the
 * `YYYY-MM-DDTHH:MM` shape the schedule endpoint accepts. Used by the
 * calendar-grid drag-drop handler.
 */
function buildScheduledAtForDate(
  target: Date,
  sourceIso: string | null,
  defaultPostTime: string,
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  let hours = 12;
  let minutes = 0;
  if (sourceIso) {
    const src = new Date(sourceIso);
    hours = src.getHours();
    minutes = src.getMinutes();
  } else {
    const [hh = '12', mm = '00'] = (defaultPostTime ?? '12:00').split(':');
    hours = Number(hh);
    minutes = Number(mm);
  }
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(hours)}:${pad(minutes)}`;
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
