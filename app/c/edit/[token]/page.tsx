'use client';

import Image from 'next/image';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  File as FileIcon,
  FileVideo,
  Film,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

/**
 * Public review page for an editing project.
 *
 * Visually + behaviorally mirrors the calendar share page (/c/[token]):
 * brand-aware header logo, name-capture modal, header status chips,
 * "Approve all" CTA, list of cards with per-video Approve / Request
 * change actions, frame.io-style timestamped comment threads with
 * file attachments. The deltas vs. the calendar share are purely
 * because editing projects don't carry post-level metadata: no
 * calendar grid, no caption / hashtags, no scheduled-at chip, no
 * tagged-people / collaborator handles. Just the videos and a
 * review thread per video.
 *
 * Anyone with the link can view + comment; the API logs one view row
 * on first paint with the optional `as` query param so we can later
 * say "Sarah opened this twice."
 */

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
  | 'video_revised';

interface SharedComment {
  id: string;
  video_id: string | null;
  share_link_id: string | null;
  author_name: string;
  author_user_id: string | null;
  content: string;
  status: SharedCommentStatus;
  attachments: CommentAttachment[];
  metadata: Record<string, unknown>;
  timestamp_seconds: number | null;
  created_at: string;
}

interface SharedVideo {
  id: string;
  filename: string | null;
  public_url: string | null;
  drive_file_id: string | null;
  mime_type: string | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  version: number | null;
  position: number | null;
  created_at: string;
  comments: SharedComment[];
}

interface SharedProject {
  id: string;
  name: string;
  brief: string | null;
  shoot_date: string | null;
  project_type: string;
}

interface SharedClient {
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  agency: string | null;
}

interface SharedPayload {
  isEditor: boolean;
  project: SharedProject;
  client: SharedClient;
  videos: SharedVideo[];
  project_comments: SharedComment[];
  expires_at: string;
}

type ReviewStatus = 'approved' | 'changes_requested' | 'comment';

export default function EditingProjectSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    try {
      const storedName =
        typeof window !== 'undefined'
          ? window.localStorage
              .getItem(`cortex_edit_share_name_${token}`)
              ?.trim() ?? ''
          : '';
      const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
      const res = await fetch(`/api/editing/share/${token}${qs}`);
      const json = await readJsonSafe(res);
      if (!res.ok) {
        const code = json && typeof json.error === 'string' ? json.error : null;
        throw new Error(code ? friendlyError(code) : 'Link unavailable');
      }
      if (!json) throw new Error('Link unavailable');
      setData(json as unknown as SharedPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedName =
          typeof window !== 'undefined'
            ? window.localStorage
                .getItem(`cortex_edit_share_name_${token}`)
                ?.trim() ?? ''
            : '';
        const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
        const res = await fetch(`/api/editing/share/${token}${qs}`);
        const json = await readJsonSafe(res);
        if (!res.ok) {
          const code = json && typeof json.error === 'string' ? json.error : null;
          throw new Error(code ? friendlyError(code) : 'Link unavailable');
        }
        if (!json) throw new Error('Link unavailable');
        if (!cancelled) setData(json as unknown as SharedPayload);
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-status-danger" />
          <h1 className="text-lg font-semibold text-text-primary">
            {error ?? 'Link not found'}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            This share link may have expired or been deactivated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SharedReviewView
      data={data}
      token={token}
      setData={setData}
      refetch={refetch}
    />
  );
}

function SharedReviewView({
  data,
  token,
  setData,
  refetch,
}: {
  data: SharedPayload;
  token: string;
  setData: (updater: (prev: SharedPayload | null) => SharedPayload | null) => void;
  refetch: () => Promise<void>;
}) {
  const storageKey = `cortex_edit_share_name_${token}`;
  const [authorName, setAuthorName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

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

  function appendComment(videoId: string, comment: SharedComment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            videos: prev.videos.map((v) =>
              v.id === videoId
                ? { ...v, comments: [...v.comments, comment] }
                : v,
            ),
          }
        : prev,
    );
  }

  function removeComment(videoId: string, commentId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            videos: prev.videos.map((v) =>
              v.id === videoId
                ? { ...v, comments: v.comments.filter((c) => c.id !== commentId) }
                : v,
            ),
          }
        : prev,
    );
  }

  function updateComment(videoId: string, comment: SharedComment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            videos: prev.videos.map((v) =>
              v.id === videoId
                ? {
                    ...v,
                    comments: v.comments.map((c) =>
                      c.id === comment.id ? comment : c,
                    ),
                  }
                : v,
            ),
          }
        : prev,
    );
  }

  function removeVideoLocal(videoId: string) {
    setData((prev) =>
      prev
        ? { ...prev, videos: prev.videos.filter((v) => v.id !== videoId) }
        : prev,
    );
  }

  // Bulk approve every video that's still pending. Sequential rather
  // than parallel so the per-video pipeline (notifications, audit
  // ordering) sees inserts in order.
  async function approveAll() {
    if (!authorName.trim()) {
      setPendingName(authorName);
      setNameModalOpen(true);
      return;
    }
    const targets = data.videos.filter(
      (v) => latestReview(v.comments) !== 'approved',
    );
    if (targets.length === 0) return;

    setApprovingAll(true);
    const toastId = toast.loading(`Approving 0 of ${targets.length}…`);
    let done = 0;
    let failed = 0;
    try {
      for (const video of targets) {
        try {
          const res = await fetch(`/api/editing/share/${token}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: video.id,
              authorName: authorName.trim(),
              content: 'Approved',
              status: 'approved',
              attachments: [],
              timestampSeconds: null,
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(typeof json.error === 'string' ? json.error : 'Failed');
          }
          appendComment(video.id, json.comment as SharedComment);
          done++;
        } catch {
          failed++;
        }
        toast.loading(`Approving ${done + failed} of ${targets.length}…`, { id: toastId });
      }
      if (failed === 0) {
        toast.success(`Approved ${done} video${done === 1 ? '' : 's'}`, { id: toastId });
      } else if (done === 0) {
        toast.error(`Could not approve any videos. Try again.`, { id: toastId });
      } else {
        toast.error(`Approved ${done}, ${failed} failed. Try the rest manually.`, { id: toastId });
      }
    } finally {
      setApprovingAll(false);
    }
  }

  const total = data.videos.length;
  const approvedCount = data.videos.filter(
    (v) => latestReview(v.comments) === 'approved',
  ).length;
  const changesCount = data.videos.filter(
    (v) => latestReview(v.comments) === 'changes_requested',
  ).length;
  const unapprovedVideos = useMemo(
    () => data.videos.filter((v) => latestReview(v.comments) !== 'approved'),
    [data.videos],
  );
  const expiresLabel = useMemo(() => {
    const d = new Date(data.expires_at);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [data.expires_at]);

  const clientName = data.client.name ?? 'Review';
  const projectName = data.project.name;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-4 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center sm:mb-5">
            <ShareHeaderLogo />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                {clientName} {DASH} {projectName}
              </h1>
              <p className="mt-2 text-sm text-text-secondary sm:text-base">
                {total} {total === 1 ? 'video' : 'videos'} to review
                {data.project.shoot_date
                  ? ` · shot ${formatShoot(data.project.shoot_date)}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unapprovedVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!authorName.trim()) {
                      setPendingName(authorName);
                      setNameModalOpen(true);
                      return;
                    }
                    setApproveAllOpen(true);
                  }}
                  disabled={approvingAll}
                  className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-status-success px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {approvingAll ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  <span className="hidden sm:inline">
                    {approvingAll
                      ? 'Approving…'
                      : `Approve all (${unapprovedVideos.length})`}
                  </span>
                  <span className="sm:hidden">
                    {approvingAll ? '…' : `Approve all (${unapprovedVideos.length})`}
                  </span>
                </button>
              )}
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
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px] sm:text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface/40 px-2.5 py-1 text-accent-text">
              <Film size={14} /> {total} {total === 1 ? 'video' : 'videos'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/12 px-2.5 py-1 text-status-success">
              <CheckCircle size={14} /> {approvedCount} approved
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning/12 px-2.5 py-1 text-status-warning">
              <AlertTriangle size={14} /> {changesCount} changes requested
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-text-muted">
              <Clock size={14} /> link expires {expiresLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
          {data.project.brief ? (
            <section className="rounded-xl border border-nativz-border bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Project brief
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                {data.project.brief}
              </p>
              {data.project.shoot_date ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <CalendarDays size={12} />
                  Shot {formatShoot(data.project.shoot_date)}
                </p>
              ) : null}
            </section>
          ) : null}

          {total === 0 ? (
            <div className="rounded-xl border border-dashed border-nativz-border bg-surface p-12 text-center">
              <FileVideo className="mx-auto h-10 w-10 text-text-muted" />
              <p className="mt-3 text-sm text-text-secondary">
                The team hasn{APOS}t uploaded any videos yet.
              </p>
            </div>
          ) : (
            data.videos.map((v, idx) => (
              <VideoCard
                key={v.id}
                index={idx + 1}
                video={v}
                projectId={data.project.id}
                isEditor={data.isEditor}
                token={token}
                authorName={authorName}
                onCommentAdded={(c) => appendComment(v.id, c)}
                onCommentRemoved={(commentId) => removeComment(v.id, commentId)}
                onCommentUpdated={(c) => updateComment(v.id, c)}
                onVideoReplaced={refetch}
                onVideoDeleted={() => removeVideoLocal(v.id)}
                requireName={() => {
                  setPendingName(authorName);
                  setNameModalOpen(true);
                }}
              />
            ))
          )}
        </div>
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
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Welcome
          </h2>
          <p className="text-sm text-text-secondary">
            Tell us who{APOS}s reviewing so your feedback is attributed correctly.
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

      <ConfirmDialog
        open={approveAllOpen}
        title={`Approve all ${unapprovedVideos.length} video${unapprovedVideos.length === 1 ? '' : 's'}?`}
        description="This signs off on every video that's still pending. Videos already marked changes requested will also be approved. You can still leave comments after."
        confirmLabel={approvingAll ? 'Approving…' : 'Approve all'}
        onConfirm={() => {
          setApproveAllOpen(false);
          void approveAll();
        }}
        onCancel={() => {
          if (!approvingAll) setApproveAllOpen(false);
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
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
  // Walk newest → oldest and return the first "live" review signal. A
  // changes_requested row that's been marked Revised (metadata.resolved)
  // is no longer live — we skip past it so the pill can fall through to
  // an earlier approval.
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved') return 'approved';
    if (c.status === 'changes_requested') {
      const resolved = !!(
        c.metadata && (c.metadata as Record<string, unknown>).resolved
      );
      if (!resolved) return 'changes_requested';
    }
  }
  return null;
}

function findLatestApprovedId(comments: SharedComment[]): string | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].status === 'approved') return comments[i].id;
  }
  return null;
}

function formatSeconds(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoCard({
  index,
  video,
  projectId,
  isEditor,
  token,
  authorName,
  onCommentAdded,
  onCommentRemoved,
  onCommentUpdated,
  onVideoReplaced,
  onVideoDeleted,
  requireName,
}: {
  index: number;
  video: SharedVideo;
  projectId: string;
  isEditor: boolean;
  token: string;
  authorName: string;
  onCommentAdded: (c: SharedComment) => void;
  onCommentRemoved: (commentId: string) => void;
  onCommentUpdated: (c: SharedComment) => void;
  onVideoReplaced: () => Promise<void>;
  onVideoDeleted: () => void;
  requireName: () => void;
}) {
  const displayLabel =
    stripExt(video.filename) ?? `Video ${index}`;
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingApproval, setRemovingApproval] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommentAttachment[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const videoSectionRef = useRef<HTMLDivElement | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [livePlayheadSeconds, setLivePlayheadSeconds] = useState(0);
  const [pinEnabled, setPinEnabled] = useState(true);

  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const revisionInputRef = useRef<HTMLInputElement>(null);

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Tick the displayed playhead twice per second while the player is
  // ready. Lets the pin chip show wherever the user is looking.
  useEffect(() => {
    if (!playerReady) return;
    const tick = () => {
      const t = videoElRef.current?.currentTime ?? 0;
      setLivePlayheadSeconds(Math.max(0, Math.floor(t)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [playerReady]);

  function readCurrentAnchorSeconds(): number | null {
    if (!pinEnabled || !playerReady) return null;
    const t = videoElRef.current?.currentTime ?? 0;
    return Math.max(0, Math.floor(t));
  }

  function seekTo(seconds: number) {
    const el = videoElRef.current;
    if (!el) return;
    try {
      el.currentTime = Math.max(0, seconds);
      const playResult = el.play?.();
      if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
        (playResult as Promise<void>).catch(() => {});
      }
    } catch {
      // Silent: the user can hit play themselves if autoplay was blocked.
    }
    videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const review = latestReview(video.comments);
  const latestApprovedId =
    review === 'approved' ? findLatestApprovedId(video.comments) : null;

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
        const res = await fetch(`/api/editing/share/${token}/upload`, {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof json.error === 'string' ? json.error : 'Upload failed',
          );
        }
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

  async function submit(status: ReviewStatus) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (
      status === 'changes_requested' &&
      !commentText.trim() &&
      pendingAttachments.length === 0
    ) {
      toast.error('Please enter revision notes or attach a file');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/editing/share/${token}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          authorName: authorName.trim(),
          content:
            commentText.trim() || (status === 'approved' ? 'Approved' : ''),
          status,
          attachments: pendingAttachments,
          // Server only honors this for `comment` / `changes_requested`;
          // approval rows strip it.
          timestampSeconds: readCurrentAnchorSeconds(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      }
      const savedComment = json.comment as SharedComment;
      onCommentAdded(savedComment);
      setCommentText('');
      setPendingAttachments([]);
      setPinEnabled(true);
      setComposerExpanded(false);
      const wasAutoApproved =
        status !== 'approved' && savedComment.status === 'approved';
      toast.success(
        wasAutoApproved
          ? 'Looked like an approval — marked approved'
          : status === 'approved'
            ? 'Video approved'
            : 'Revision added',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeApproval() {
    if (!latestApprovedId) return;
    setRemovingApproval(true);
    try {
      const res = await fetch(`/api/editing/share/${token}/comment`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: latestApprovedId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to remove approval',
        );
      }
      onCommentRemoved(latestApprovedId);
      toast.success('Approval removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove approval');
    } finally {
      setRemovingApproval(false);
    }
  }

  // Editor-only "Replace" — three-step flow:
  //   1) POST /api/admin/editing/projects/:id/videos with replace_video_id
  //      → server inserts a new placeholder row + signed upload URL.
  //   2) PUT bytes directly to the signed URL.
  //   3) POST /api/editing/share/:token/comment with status='video_revised'
  //      so the activity feed reflects the new cut, then refetch the page.
  async function uploadReplacementFile(file: File) {
    if (!isEditor) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Choose a video file');
      return;
    }
    setUploadingRevision(true);
    setUploadProgress(0);
    try {
      const initRes = await fetch(
        `/api/admin/editing/projects/${projectId}/videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mime_type: file.type || 'video/mp4',
            size_bytes: file.size,
            position: video.position ?? 0,
            replace_video_id: video.id,
          }),
        },
      );
      const initJson = await initRes.json().catch(() => null);
      if (!initRes.ok || !initJson?.signed_url) {
        throw new Error(
          typeof initJson?.error === 'string'
            ? initJson.error
            : 'Could not start upload',
        );
      }
      const uploadUrl = initJson.signed_url as string;
      const newVideoId = initJson.video_id as string;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.send(file);
      });

      // Stamp filename on the new row (size already on row from step 1).
      await fetch(
        `/api/admin/editing/projects/${projectId}/videos/${newVideoId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        },
      ).catch(() => {});

      // Audit row in the review thread so the brand sees "<editor>
      // replaced this video" in-line with the rest of the activity.
      try {
        await fetch(`/api/editing/share/${token}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: newVideoId,
            authorName: authorName.trim() || 'Editor',
            content: 're-uploaded the video',
            status: 'video_revised',
            attachments: [],
            timestampSeconds: null,
          }),
        });
      } catch {
        // Non-fatal — the upload itself succeeded.
      }

      toast.success('New cut uploaded');
      await onVideoReplaced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingRevision(false);
      setUploadProgress(null);
      if (revisionInputRef.current) revisionInputRef.current.value = '';
    }
  }

  async function confirmRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/videos/${video.id}`,
        { method: 'DELETE' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to remove',
        );
      }
      toast.success('Removed');
      setRemoveOpen(false);
      onVideoDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
      setRemoving(false);
    }
  }

  const headerBlock = (
    <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
        {review === null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm font-medium text-text-muted">
            <MessageSquare size={13} /> Awaiting review
          </span>
        )}
        {video.duration_s ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-1 text-xs text-text-muted">
            <Clock size={11} /> {formatDuration(video.duration_s)}
          </span>
        ) : null}
        {(video.version ?? 1) > 1 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-surface/40 px-2.5 py-1 text-xs text-accent-text">
            <Film size={11} /> v{video.version}
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Video {index}
        </p>
        <h3 className="break-words text-[15px] font-medium leading-snug text-text-primary">
          {displayLabel}
        </h3>
      </div>
    </div>
  );

  const videoPanel = (
    <div ref={videoSectionRef} className="relative h-full w-full">
      {video.public_url ? (
        <video
          ref={videoElRef}
          src={video.public_url}
          controls
          playsInline
          preload="metadata"
          className="block h-full w-full bg-black object-contain"
          onLoadedMetadata={() => setPlayerReady(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-hover">
          <FileVideo className="h-10 w-10 text-text-muted" />
        </div>
      )}
      {isEditor && (
        <button
          type="button"
          onClick={() => revisionInputRef.current?.click()}
          disabled={uploadingRevision || submitting || uploading}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur-md ring-1 ring-white/15 transition-all hover:bg-black/75 hover:ring-white/30 disabled:opacity-60"
          title="Replace this video with a new upload"
        >
          {uploadingRevision ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          {uploadingRevision
            ? uploadProgress !== null
              ? `${uploadProgress}%`
              : 'Uploading…'
            : 'Replace'}
        </button>
      )}
    </div>
  );

  const revisionInput = isEditor ? (
    <input
      ref={revisionInputRef}
      type="file"
      accept="video/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) uploadReplacementFile(f);
      }}
    />
  ) : null;

  const historyBlock =
    video.comments.length > 0 ? (
      <div className="mt-2 border-t border-nativz-border bg-background/40 px-3 py-4 sm:px-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            History
          </h3>
          <span className="text-[10px] font-medium text-text-muted/70">
            {video.comments.length}
          </span>
        </div>
        <div className="space-y-2">
          {video.comments.map((c) => (
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
    ) : null;

  const composerBlock = (
    <div className="border-t border-nativz-border bg-surface px-3 py-3 sm:px-4">
      {composerExpanded && (
        <div className="mb-3 rounded-lg border border-nativz-border bg-background/60 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/40">
          <textarea
            ref={(el) => {
              if (
                el &&
                composerExpanded &&
                document.activeElement !== el &&
                !commentText
              ) {
                el.focus();
              }
            }}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Notes on the video (cuts, music, hook, etc.)"
            rows={3}
            className="w-full resize-none rounded-t-lg bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            disabled={submitting}
          />

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {pendingAttachments.map((a) => (
                <AttachmentChip
                  key={a.url}
                  attachment={a}
                  onRemove={() => removeAttachment(a.url)}
                />
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

          <div className="flex flex-wrap items-center gap-2 border-t border-nativz-border/60 px-2 py-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                submitting || uploading || pendingAttachments.length >= 10
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Paperclip size={13} />
              )}
              {uploading ? 'Uploading…' : 'Attach files'}
            </button>
            {playerReady &&
              (pinEnabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-2.5 py-1 text-xs font-medium text-accent-text ring-1 ring-accent/40">
                  <MapPin size={12} />
                  At {formatSeconds(livePlayheadSeconds)}
                  <button
                    type="button"
                    onClick={() => setPinEnabled(false)}
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-accent/20"
                    aria-label="Don't reference a timestamp"
                    title="Don't reference a timestamp"
                  >
                    <X size={11} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPinEnabled(true)}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                  title="Reference current timestamp"
                >
                  <MapPin size={13} /> Reference timestamp
                </button>
              ))}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setComposerExpanded(false);
                  setCommentText('');
                  setPendingAttachments([]);
                }}
                disabled={submitting || uploading}
                className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-text-muted transition-all hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit('changes_requested')}
                disabled={
                  submitting ||
                  uploading ||
                  (!commentText.trim() && pendingAttachments.length === 0)
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-accent"
              >
                {submitting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {review === 'approved' && latestApprovedId ? (
          <button
            type="button"
            onClick={removeApproval}
            disabled={removingApproval || submitting || uploading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:flex-none sm:py-2"
          >
            {removingApproval ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Undo2 size={14} />
            )}
            Remove approval
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit('approved')}
            disabled={submitting || uploading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-accent px-4 py-2.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-accent sm:flex-none sm:py-2"
          >
            <CheckCircle size={14} /> Approve
          </button>
        )}
        <button
          type="button"
          onClick={() => setComposerExpanded((v) => !v)}
          disabled={submitting || uploading}
          aria-expanded={composerExpanded}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 sm:flex-none sm:py-2 ${
            composerExpanded
              ? 'border-accent/50 bg-accent-surface text-accent-text'
              : 'border-nativz-border bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <MessageSquare size={14} /> Request change
        </button>
        {isEditor && (
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            disabled={submitting || uploading || removing}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-status-danger/40 hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-50 sm:ml-auto sm:h-9 sm:w-9 sm:px-0 sm:py-0"
            title="Remove this video"
            aria-label="Remove this video"
          >
            {removing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            <span className="sm:hidden">
              {removing ? 'Removing…' : 'Remove video'}
            </span>
          </button>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        title="Remove this video?"
        description="This deletes the current cut from the project. The brand will no longer see it in the review. If you want to ship a new version instead, use Replace."
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        variant="danger"
        onConfirm={() => {
          setRemoveOpen(false);
          void confirmRemove();
        }}
        onCancel={() => {
          if (!removing) setRemoveOpen(false);
        }}
      />
    </div>
  );

  const heightPx = 'md:h-[78vh]';
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface md:flex-row ${heightPx}`}
    >
      {revisionInput}
      <div className="aspect-[9/16] w-full bg-black md:h-full md:w-auto md:flex-shrink-0">
        {videoPanel}
      </div>
      <div className="flex flex-1 flex-col md:h-full md:min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4">{headerBlock}</div>
          {historyBlock}
        </div>
        {composerBlock}
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
  onSeek?: (seconds: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);

  const isResolved =
    comment.status === 'changes_requested' &&
    !!(comment.metadata && (comment.metadata as Record<string, unknown>).resolved);
  const wasAutoApproved =
    comment.status === 'approved' &&
    !!(comment.metadata && (comment.metadata as Record<string, unknown>).auto_approved);

  async function toggleResolved() {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/editing/share/${token}/comment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, resolved: !isResolved }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to update',
        );
      }
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
      skip =
        typeof window !== 'undefined' &&
        window.localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === '1';
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
        // ignore storage failures
      }
    }
    try {
      const res = await fetch(`/api/editing/share/${token}/comment`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to remove',
        );
      }
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
            <span className="text-text-muted">Can{APOS}t be undone.</span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
            <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-text-muted">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
                className="h-3 w-3 accent-[color:var(--accent)]"
              />
              Don{APOS}t ask again
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

  const resolveButton =
    comment.status === 'changes_requested' && isEditor ? (
      <button
        type="button"
        onClick={toggleResolved}
        disabled={resolving}
        aria-label={isResolved ? 'Reopen revision' : 'Mark as revised'}
        aria-pressed={isResolved}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          isResolved
            ? 'bg-status-success/12 text-status-success ring-1 ring-status-success/30 hover:bg-status-success/20'
            : 'bg-surface text-text-secondary ring-1 ring-nativz-border hover:bg-status-success/10 hover:text-status-success hover:ring-status-success/40'
        }`}
        title={
          isResolved
            ? 'Click to reopen this revision'
            : 'Click when this revision is done'
        }
      >
        {resolving ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <CheckCircle size={11} />
        )}
        Revised
      </button>
    ) : null;

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

  const tone = isResolved
    ? 'text-status-success'
    : comment.status === 'approved'
      ? 'text-status-success'
      : comment.status === 'changes_requested'
        ? 'text-status-warning'
        : comment.status === 'video_revised'
          ? 'text-accent-text'
          : 'text-text-secondary';
  const Icon = isResolved
    ? CheckCircle
    : comment.status === 'approved'
      ? CheckCircle
      : comment.status === 'changes_requested'
        ? AlertTriangle
        : comment.status === 'video_revised'
          ? Film
          : MessageSquare;
  const time = new Date(comment.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (comment.status === 'video_revised') {
    return (
      <div className="group rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
        <div className="flex items-center gap-2 text-[13px]">
          <Icon size={12} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">
            {comment.content || 're-uploaded the video'} · {time}
          </span>
          {headerDeleteButton}
        </div>
      </div>
    );
  }

  const containerClass = isResolved
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
  const isChangesRequestedRow = comment.status === 'changes_requested';
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
        title={
          onSeek
            ? `Jump to ${formatSeconds(comment.timestamp_seconds)} in the video`
            : `Pinned at ${formatSeconds(comment.timestamp_seconds)}`
        }
        aria-label={
          onSeek
            ? `Jump to ${formatSeconds(comment.timestamp_seconds)} in the video`
            : `Pinned at ${formatSeconds(comment.timestamp_seconds)}`
        }
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
        <span className="text-text-muted">
          · {trailingMeta}
          {time}
        </span>
        {timestampPill}
        {headerDeleteButton}
      </div>
      {comment.content && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-secondary">
          {comment.content}
        </p>
      )}
      {comment.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {comment.attachments.map((a) => (
            <CommentAttachmentTile key={a.url} attachment={a} />
          ))}
        </div>
      )}
      {isChangesRequestedRow && (
        <div className="mt-2 flex items-center justify-end border-t border-nativz-border/60 pt-2">
          {resolveButton}
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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.url}
          alt=""
          className="h-8 w-8 rounded object-cover"
        />
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="h-24 w-24 object-cover"
        />
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
        <video
          src={attachment.url}
          className="h-24 w-24 object-cover"
          muted
          playsInline
        />
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

function stripExt(name: string | null): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatShoot(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// See app/c/[token]/page.tsx readJsonSafe — same defensive parse so empty
// or non-JSON bodies don't surface as "Unexpected end of JSON input" to
// editing-share visitors.
async function readJsonSafe(
  res: Response,
): Promise<Record<string, unknown> | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function friendlyError(code: string): string {
  switch (code) {
    case 'expired':
      return 'This link has expired.';
    case 'revoked':
      return 'This link has been revoked.';
    case 'not_found':
      return 'Link not found.';
    default:
      return 'Failed to load.';
  }
}

// Plain hyphen + ASCII apostrophe used in JSX to keep the file 100%
// free of em/en dashes (see CLAUDE.md). Constants make the intent
// readable and let an audit grep for them.
const DASH = '-';
const APOS = "'";
