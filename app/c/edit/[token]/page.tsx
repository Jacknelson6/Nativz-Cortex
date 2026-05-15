'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  Eye,
  EyeOff,
  File as FileIcon,
  FileVideo,
  Film,
  Loader2,
  LogIn,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import { thumbUrl } from '@/lib/calendar/thumb-url';
import { ShareTour, ShareTourLaunchButton, EDIT_SHARE_BEATS } from '@/components/share/share-tour';
import {
  ShareGatewayModal,
  readGuestName,
  clearGuestName,
} from '@/components/share/gateway-modal';
import { RoleChip } from '@/components/share/role-chip';

const EDIT_TOUR_STORAGE_KEY = 'cortex.share.editTourSeen';

// Load MuxPlayer client-only; the custom element registration explodes
// during SSR.
const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
});

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
  // PRD 05: server-enforced role tag (admin | viewer | guest). Falls back
  // to 'guest' for pre-migration rows so the chip never renders for
  // historical comments that predate the role column.
  author_role: 'admin' | 'viewer' | 'guest';
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
  /**
   * Optional viewer-facing display name. NULL falls back to the filename
   * (sans extension). Editable inline from the public share link.
   */
  title: string | null;
  public_url: string | null;
  drive_file_id: string | null;
  mime_type: string | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  version: number | null;
  position: number | null;
  created_at: string;
  /**
   * Mux pipeline state. Render layer prefers `mux_playback_id` over
   * `public_url` when present; pre-Mux rows still play via the legacy
   * Supabase Storage URL.
   */
  mux_playback_id: string | null;
  mux_status:
    | 'pending'
    | 'uploading'
    | 'processing'
    | 'ready'
    | 'errored'
    | null;
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

interface SharedShareLink {
  id: string;
  /**
   * Admin-set override for the public page header. NULL falls back to
   * the derived "<client> - <project>" label. Editable inline by a
   * signed-in admin; PATCH /api/editing/review/[id] persists it.
   */
  name: string | null;
}

interface SharedPayload {
  isEditor: boolean;
  share_link: SharedShareLink;
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
          ? (readGuestName(token) ||
              window.localStorage
                .getItem(`cortex_edit_share_name_${token}`)
                ?.trim() ||
              '')
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
            ? (readGuestName(token) ||
                window.localStorage
                  .getItem(`cortex_edit_share_name_${token}`)
                  ?.trim() ||
                '')
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
  const legacyStorageKey = `cortex_edit_share_name_${token}`;
  const [authorName, setAuthorName] = useState('');
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [gatewayInfo, setGatewayInfo] = useState<{
    agencyMismatch: boolean;
    agencyAvailable: boolean;
  }>({ agencyMismatch: false, agencyAvailable: false });
  const [boundIdentity, setBoundIdentity] = useState<{
    displayName: string;
    role: 'admin' | 'super_admin' | 'viewer';
  } | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  // PRD 06 §"View as client": admins flip this to preview the page
  // without admin chrome (replace/remove/cover/mark-revised affordances).
  // Local-only — does not change server-side identity.
  const [viewAsClient, setViewAsClient] = useState(false);
  const effectiveIsEditor = data.isEditor && !viewAsClient;

  // PRD 02 §"Server resolution". Probe identity first; auto-bound
  // sessions skip the gateway, gateway/guest paths fall back to the
  // legacy stored name if any. Mirrors the calendar share flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/share/${token}/identity`);
        const json = (await res.json().catch(() => null)) as
          | {
              state: 'auto_bound' | 'gateway' | 'expired' | 'archived' | 'not_found';
              identity?: { displayName: string; role: 'admin' | 'super_admin' | 'viewer' };
              sessionPresent?: boolean;
              agencyMismatch?: boolean;
              agencyAvailable?: boolean;
            }
          | null;
        if (cancelled || !json) return;

        if (json.state === 'auto_bound' && json.identity) {
          setAuthorName(json.identity.displayName);
          setBoundIdentity({
            displayName: json.identity.displayName,
            role: json.identity.role,
          });
          setGatewayOpen(false);
          return;
        }

        if (json.state === 'gateway') {
          const guest =
            readGuestName(token) ||
            (typeof window !== 'undefined'
              ? window.localStorage.getItem(legacyStorageKey)?.trim() ?? ''
              : '');
          if (guest) {
            setAuthorName(guest);
            setGatewayOpen(false);
          } else {
            setGatewayOpen(true);
          }
          setGatewayInfo({
            agencyMismatch: !!json.agencyMismatch,
            agencyAvailable: !!json.agencyAvailable,
          });
          return;
        }
      } catch {
        if (typeof window !== 'undefined') {
          const guest =
            readGuestName(token) ||
            window.localStorage.getItem(legacyStorageKey)?.trim() ||
            '';
          if (guest) {
            setAuthorName(guest);
            setGatewayOpen(false);
          } else {
            setGatewayOpen(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, legacyStorageKey]);

  async function reprobeIdentity() {
    try {
      const res = await fetch(`/api/share/${token}/identity`);
      const json = (await res.json().catch(() => null)) as
        | {
            state: 'auto_bound' | 'gateway' | 'expired' | 'archived' | 'not_found';
            identity?: { displayName: string; role: 'admin' | 'super_admin' | 'viewer' };
            agencyMismatch?: boolean;
            agencyAvailable?: boolean;
          }
        | null;
      if (!json) return;
      if (json.state === 'auto_bound' && json.identity) {
        setAuthorName(json.identity.displayName);
        setBoundIdentity({
          displayName: json.identity.displayName,
          role: json.identity.role,
        });
        return;
      }
      if (json.state === 'gateway') {
        setBoundIdentity(null);
        setGatewayInfo({
          agencyMismatch: !!json.agencyMismatch,
          agencyAvailable: !!json.agencyAvailable,
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  async function handleSwitchIdentity() {
    if (boundIdentity) {
      try {
        await fetch(`/api/share/${token}/auth/login`, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
      setBoundIdentity(null);
    }
    clearGuestName(token);
    try {
      window.localStorage.removeItem(legacyStorageKey);
    } catch {
      /* ignore */
    }
    setAuthorName('');
    await reprobeIdentity();
    setGatewayOpen(true);
  }

  // Deep-link support: webhook chat pings include `#video-N` so the link
  // jumps straight to the cut under discussion.
  const videoCount = data.videos.length;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#video-')) return;
    if (videoCount === 0) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [videoCount]);

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

  function updateVideoTitleLocal(videoId: string, title: string | null) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            videos: prev.videos.map((v) =>
              v.id === videoId ? { ...v, title } : v,
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
      setGatewayOpen(true);
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

  /**
   * Bundle every cut into a single zip and hand the browser one save
   * dialog. Triggering 16 anchor clicks in a row gets popup-blocked or
   * silently dropped on most browsers, which is what was happening here
   * before. Fetches run in parallel (browser caps per-host concurrency
   * to ~6), assets are added with STORE (no DEFLATE) since h264 + png
   * don't compress further, and `jszip` is dynamically imported so the
   * library only ships when this button is actually clicked.
   */
  async function handleDownloadAll() {
    if (downloadingAll) return;
    const targets = data.videos
      .map((v, idx) => ({ video: v, idx, url: getDownloadUrl(v) }))
      .filter((t): t is { video: SharedVideo; idx: number; url: string } =>
        Boolean(t.url),
      );
    if (targets.length === 0) {
      toast.error('Nothing to download yet.');
      return;
    }
    setDownloadingAll(true);
    const toastId = toast.loading(`Fetching 0 of ${targets.length}…`);
    let fetched = 0;
    let failed = 0;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const usedNames = new Set<string>();

      await Promise.all(
        targets.map(async (t) => {
          try {
            const res = await fetch(t.url);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const buf = await res.arrayBuffer();
            const name = uniqueZipName(
              usedNames,
              getDownloadFilename(t.video, t.idx),
            );
            zip.file(name, buf, { binary: true, compression: 'STORE' });
            fetched++;
          } catch {
            failed++;
          } finally {
            toast.loading(
              `Fetching ${fetched + failed} of ${targets.length}…`,
              { id: toastId },
            );
          }
        }),
      );

      if (fetched === 0) {
        toast.error('Could not download any files. Try again.', {
          id: toastId,
        });
        return;
      }

      toast.loading('Building zip…', { id: toastId });
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
      });

      const zipName = buildZipFilename(clientName, projectName);
      const objUrl = URL.createObjectURL(zipBlob);
      try {
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
      }

      if (failed === 0) {
        toast.success(
          `Zipped ${fetched} file${fetched === 1 ? '' : 's'}`,
          { id: toastId },
        );
      } else {
        toast.error(
          `Zipped ${fetched}, ${failed} failed.`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error('[handleDownloadAll] zip failed', err);
      toast.error('Could not build zip. Try again.', { id: toastId });
    } finally {
      setDownloadingAll(false);
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
  const headerFallback = `${clientName} ${DASH} ${projectName}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-3 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center sm:mb-5">
            <ShareHeaderLogo />
          </div>
          {/*
            Header row uses flex-wrap only below `sm` so a long project
            name on phones can break to a new line without colliding
            with the action cluster, but on tablet/desktop the title
            truncates instead of pushing the actions to a second row.
            `min-w-0 flex-1` on the title column is the bit that lets
            the inner truncate actually shrink under flex.
          */}
          <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              {/*
                Mirrors the SMM share page header. Admin can rename the
                public review page inline; PATCH lands on the share link
                row so it doesn't disturb the underlying project name.
                Non-admin viewers see a static title.
              */}
              <ProjectNameHeader
                name={data.share_link.name}
                fallback={headerFallback}
                isEditor={data.isEditor}
                shareLinkId={data.share_link.id}
                onRenamed={(next) =>
                  setData((prev) =>
                    prev ? { ...prev, share_link: { ...prev.share_link, name: next } } : prev,
                  )
                }
              />
              <p className="mt-2 truncate text-sm text-text-secondary sm:text-base">
                {total} {total === 1 ? 'video' : 'videos'} to review
                {data.project.shoot_date
                  ? ` · shot ${formatShoot(data.project.shoot_date)}`
                  : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/*
                Editor-recovery pill. Hidden when the viewer is already a
                signed-in admin (Replace/Remove affordances live on each
                video row). When NULL, gives any Nativz teammate looking
                at this share link a one-tap path back to their signed-in
                editor state. Common case: the link was opened on a
                brand-vanity subdomain (e.g. cortex.andersoncollaborative.com)
                where the Nativz Supabase cookie isn't scoped, so isEditor
                comes back false and the team member can't see Replace.
                Round-trip to /login?next=<current path> mints the session
                on this subdomain and returns them to the same review screen.
              */}
              {!data.isEditor && (
                <a
                  href={`/login?next=${encodeURIComponent(`/c/edit/${token}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
                  title="Sign in to replace or remove files"
                >
                  <LogIn size={14} />
                  <span className="hidden sm:inline">Sign in to edit</span>
                  <span className="sm:hidden">Sign in</span>
                </a>
              )}
              {data.isEditor && (
                <button
                  type="button"
                  onClick={() => setViewAsClient((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border px-3.5 py-2 text-sm font-medium transition-all ${
                    viewAsClient
                      ? 'border-accent-text/50 bg-accent-surface/40 text-accent-text hover:bg-accent-surface/60'
                      : 'border-nativz-border bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  title={
                    viewAsClient
                      ? 'Switch back to team view'
                      : 'Preview the page as a brand reviewer would see it'
                  }
                  aria-pressed={viewAsClient}
                >
                  {viewAsClient ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span className="hidden sm:inline">
                    {viewAsClient ? 'Team view' : 'View as client'}
                  </span>
                </button>
              )}
              {total > 0 && (
                <ShareTourLaunchButton storageKey={EDIT_TOUR_STORAGE_KEY} />
              )}
              {total > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  title={`Download all ${total} ${total === 1 ? 'file' : 'files'} as a zip`}
                >
                  {downloadingAll ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span className="hidden sm:inline">
                    {downloadingAll
                      ? 'Preparing zip…'
                      : `Download all (${total})`}
                  </span>
                  <span className="sm:hidden">
                    {downloadingAll ? '…' : `Download (${total})`}
                  </span>
                </button>
              )}
              {unapprovedVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!authorName.trim()) {
                      setGatewayOpen(true);
                      return;
                    }
                    setApproveAllOpen(true);
                  }}
                  disabled={approvingAll}
                  data-tour="approve-all"
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
                  onClick={() => void handleSwitchIdentity()}
                  className="rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
                  title={boundIdentity ? 'Sign out and switch' : 'Change name'}
                >
                  {authorName}
                  {boundIdentity ? (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-text-muted">
                      {boundIdentity.role === 'viewer' ? 'client' : 'team'}
                    </span>
                  ) : null}
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
              <AlertTriangle size={14} /> {changesCount} {changesCount === 1 ? 'revision' : 'revisions'}
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
                projectType={data.project.project_type}
                isEditor={effectiveIsEditor}
                token={token}
                authorName={authorName}
                onCommentAdded={(c) => appendComment(v.id, c)}
                onCommentRemoved={(commentId) => removeComment(v.id, commentId)}
                onCommentUpdated={(c) => updateComment(v.id, c)}
                onVideoReplaced={refetch}
                onVideoDeleted={() => removeVideoLocal(v.id)}
                onTitleUpdated={(title) => updateVideoTitleLocal(v.id, title)}
                requireName={() => setGatewayOpen(true)}
              />
            ))
          )}
        </div>
      </main>

      <ShareTour
        enabled={!gatewayOpen && data.videos.length > 0}
        beats={EDIT_SHARE_BEATS}
        storageKey={EDIT_TOUR_STORAGE_KEY}
      />

      <ShareGatewayModal
        open={gatewayOpen}
        token={token}
        agencyMismatch={gatewayInfo.agencyMismatch}
        agencyAvailable={gatewayInfo.agencyAvailable}
        defaultGuestName={authorName}
        onLoggedIn={async () => {
          await reprobeIdentity();
          setGatewayOpen(false);
          await refetch();
        }}
        onGuestNamed={(name) => {
          setAuthorName(name);
          try {
            window.localStorage.setItem(legacyStorageKey, name);
          } catch {
            /* ignore */
          }
          setGatewayOpen(false);
        }}
      />

      <ConfirmDialog
        open={approveAllOpen}
        title={`Approve all ${unapprovedVideos.length} video${unapprovedVideos.length === 1 ? '' : 's'}?`}
        description="This signs off on every video that's still pending. Videos already marked changes requested will also be approved. You can still leave comments after."
        confirmLabel={approvingAll ? 'Approving…' : 'Approve all'}
        variant="success"
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
  projectType,
  isEditor,
  token,
  authorName,
  onCommentAdded,
  onCommentRemoved,
  onCommentUpdated,
  onVideoReplaced,
  onVideoDeleted,
  onTitleUpdated,
  requireName,
}: {
  index: number;
  video: SharedVideo;
  projectId: string;
  projectType: string;
  isEditor: boolean;
  token: string;
  authorName: string;
  onCommentAdded: (c: SharedComment) => void;
  onCommentRemoved: (commentId: string) => void;
  onCommentUpdated: (c: SharedComment) => void;
  onVideoReplaced: () => Promise<void>;
  onVideoDeleted: () => void;
  onTitleUpdated: (title: string | null) => void;
  requireName: () => void;
}) {
  const filenameFallback = stripExt(video.filename);
  const displayLabel =
    (video.title && video.title.trim()) ||
    filenameFallback ||
    `Video ${index}`;
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingApproval, setRemovingApproval] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommentAttachment[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const videoSectionRef = useRef<HTMLDivElement | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [livePlayheadSeconds, setLivePlayheadSeconds] = useState(0);
  const [pinEnabled, setPinEnabled] = useState(true);
  // PRD 01: composer defaults to plain feedback. Reviewer opts into "revision"
  // explicitly when the note represents a change request.
  const [markAsRevision, setMarkAsRevision] = useState(false);

  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const revisionInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

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
    if (
      status === 'comment' &&
      !commentText.trim() &&
      pendingAttachments.length === 0
    ) {
      toast.error('Please enter a comment or attach a file');
      return;
    }

    // Optimistic flow mirrors the calendar share page: paint a temp
    // comment so the approve / changes_requested chip flips state without
    // waiting on the round trip. Swap for the real row on success; yank
    // it on failure and surface the error so the user can retry.
    const tempId = `temp-${
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    }`;
    const trimmedAuthor = authorName.trim();
    const resolvedContent =
      commentText.trim() || (status === 'approved' ? 'Approved' : '');
    const anchorSeconds = readCurrentAnchorSeconds();
    const snapshotAttachments = pendingAttachments;
    const tempComment: SharedComment = {
      id: tempId,
      video_id: video.id,
      share_link_id: null,
      author_name: trimmedAuthor,
      author_user_id: null,
      // PRD 05: server derives the real role from the session. Local row
      // stays 'guest' so RoleChip renders nothing until the real row lands.
      author_role: 'guest',
      content: resolvedContent,
      // Local intent; server may auto-upgrade changes_requested → approved
      // and we reconcile when the real row lands.
      status,
      attachments: snapshotAttachments,
      metadata: {},
      timestamp_seconds: anchorSeconds,
      created_at: new Date().toISOString(),
    };

    onCommentAdded(tempComment);
    setCommentText('');
    setPendingAttachments([]);
    setPinEnabled(true);
    setMarkAsRevision(false);
    const optimisticToastId = toast.success(
      status === 'approved'
        ? 'Video approved'
        : status === 'changes_requested'
          ? 'Revision added'
          : 'Comment added',
    );

    setSubmitting(true);
    try {
      const res = await fetch(`/api/editing/share/${token}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          authorName: trimmedAuthor,
          content: resolvedContent,
          status,
          attachments: snapshotAttachments,
          // Server only honors this for `comment` / `changes_requested`;
          // approval rows strip it.
          timestampSeconds: anchorSeconds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      }
      const savedComment = json.comment as SharedComment;
      onCommentRemoved(tempId);
      onCommentAdded(savedComment);
    } catch (err) {
      onCommentRemoved(tempId);
      toast.dismiss(optimisticToastId);
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
      setCommentText(resolvedContent === 'Approved' ? '' : resolvedContent);
      setPendingAttachments(snapshotAttachments);
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
  //      → server mints a Mux direct upload + inserts a placeholder row.
  //   2) PUT file bytes straight to the Mux upload URL (no Content-Type
  //      header — Mux infers it). The webhook flips mux_status to ready
  //      once Mux finishes packaging.
  //   3) POST /api/editing/share/:token/comment with status='video_revised'
  //      so the activity feed reflects the new cut, then refetch the page.
  async function uploadReplacementFile(file: File) {
    if (!isEditor) return;
    const incomingIsImage = file.type.startsWith('image/');
    const incomingIsVideo = file.type.startsWith('video/');
    if (isImage && !incomingIsImage) {
      toast.error('Choose an image file');
      return;
    }
    if (!isImage && !incomingIsVideo) {
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
      if (!initRes.ok || !initJson?.upload_url) {
        throw new Error(
          typeof initJson?.error === 'string'
            ? initJson.error
            : 'Could not start upload',
        );
      }
      const uploadUrl = initJson.upload_url as string;
      const newVideoId = initJson.video_id as string;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        // Supabase Storage signed-upload URLs (image branch) require the
        // Content-Type header so the stored object carries the right MIME.
        // Mux direct-upload URLs (video branch) infer from bytes and reject
        // a Content-Type override on preflight.
        if (initJson.kind === 'image') {
          xhr.setRequestHeader(
            'Content-Type',
            file.type || 'application/octet-stream',
          );
        }
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
            content: incomingIsImage
              ? 're-uploaded the image'
              : 're-uploaded the video',
            status: 'video_revised',
            attachments: [],
            timestampSeconds: null,
          }),
        });
      } catch {
        // Non-fatal — the upload itself succeeded.
      }

      toast.success(incomingIsImage ? 'New image uploaded' : 'New cut uploaded');
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

  const isImage = !!video.mime_type && video.mime_type.startsWith('image/');

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
            <AlertTriangle size={13} /> Revision requested
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
          {isImage ? 'Image' : 'Video'} {index}
        </p>
        <ClipTitleEditor
          token={token}
          videoId={video.id}
          title={video.title}
          fallback={filenameFallback}
          displayTitle={displayLabel}
          onSaved={onTitleUpdated}
          requireName={requireName}
          hasName={!!authorName.trim()}
        />
      </div>
    </div>
  );

  const muxStatus = video.mux_status ?? null;
  const muxProcessing =
    !isImage &&
    (muxStatus === 'pending' ||
      muxStatus === 'uploading' ||
      muxStatus === 'processing');
  const muxPoster = video.mux_playback_id
    ? `https://image.mux.com/${video.mux_playback_id}/thumbnail.jpg?width=1280&fit_mode=preserve&time=1`
    : undefined;
  const imageSrc = isImage && video.public_url ? thumbUrl(video.public_url, 1600) : null;
  const videoPanel = (
    <div ref={videoSectionRef} className="relative h-full w-full">
      {isImage ? (
        imageSrc ? (
          <div className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={displayLabel}
              className="block max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-hover">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        )
      ) : video.mux_playback_id ? (
        <MuxPlayer
          // MuxPlayer's ref points at the <mux-player> custom element
          // which exposes `currentTime` like an HTMLVideoElement, so the
          // existing comment-timestamp wiring still works.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={videoElRef as any}
          playbackId={video.mux_playback_id}
          poster={muxPoster}
          streamType="on-demand"
          playsInline
          className="block h-full w-full bg-black"
          style={{
            ['--media-object-fit' as string]: 'contain',
            // Mux Player controls inherit the active brand accent (Nativz
            // cyan on cortex.nativz.io, AC teal on cortex.andersoncollab…)
            // via the `--accent` token set by [data-brand-mode] in
            // globals.css.
            ['--media-accent-color' as string]: 'var(--accent)',
            ['--media-primary-color' as string]: 'var(--accent)',
            aspectRatio: 'auto',
          }}
          onLoadedMetadata={() => setPlayerReady(true)}
        />
      ) : video.public_url ? (
        // Legacy (pre-Mux) videos render through MuxPlayer with `src` so the
        // editing-share chrome stays consistent with Mux-backed rows. Mux
        // Player falls back to HTMLMediaElement playback when given a plain
        // URL, no HLS manifest required.
        <MuxPlayer
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={videoElRef as any}
          src={video.public_url}
          streamType="on-demand"
          playsInline
          className="block h-full w-full bg-black"
          style={{
            ['--media-object-fit' as string]: 'contain',
            ['--media-accent-color' as string]: 'var(--accent)',
            ['--media-primary-color' as string]: 'var(--accent)',
            aspectRatio: 'auto',
          }}
          onLoadedMetadata={() => setPlayerReady(true)}
        />
      ) : muxProcessing ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-hover text-text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-xs">Processing video…</p>
        </div>
      ) : muxStatus === 'errored' ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-hover">
          <AlertTriangle className="h-6 w-6 text-[color:var(--status-danger)]" />
          <p className="text-xs text-[color:var(--status-danger)]">
            Upload failed
          </p>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-hover">
          <FileVideo className="h-10 w-10 text-text-muted" />
        </div>
      )}
      <div className="absolute right-2 top-2 flex items-center gap-1.5">
        {(() => {
          const downloadUrl = getDownloadUrl(video);
          if (!downloadUrl) return null;
          return (
            <button
              type="button"
              onClick={async () => {
                if (downloading) return;
                setDownloading(true);
                try {
                  await downloadAsset(
                    downloadUrl,
                    getDownloadFilename(video, index - 1),
                  );
                } catch {
                  toast.error('Download failed.');
                } finally {
                  setDownloading(false);
                }
              }}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur-md ring-1 ring-white/15 transition-all hover:bg-black/75 hover:ring-white/30 disabled:opacity-60"
              title={isImage ? 'Download this image' : 'Download this video'}
            >
              {downloading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          );
        })()}
        {isEditor && (
          <button
            type="button"
            onClick={() => revisionInputRef.current?.click()}
            disabled={uploadingRevision || submitting || uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur-md ring-1 ring-white/15 transition-all hover:bg-black/75 hover:ring-white/30 disabled:opacity-60"
            title={
              isImage
                ? 'Replace this image with a new upload'
                : 'Replace this video with a new upload'
            }
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
    </div>
  );

  const revisionInput = isEditor ? (
    <input
      ref={revisionInputRef}
      type="file"
      accept={isImage ? 'image/*' : 'video/*'}
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
        <div className="space-y-2 pr-1">
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
      <div className="mb-3 rounded-lg border border-nativz-border bg-background/60 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/40">
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a comment, or toggle Mark as revision to request changes…"
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
          {/* PRD 01: revision toggle. Default is plain feedback; flip to
              promote the submit to a revision request. */}
          <button
            type="button"
            onClick={() => setMarkAsRevision((v) => !v)}
            disabled={submitting || uploading}
            aria-pressed={markAsRevision}
            title={markAsRevision ? 'Sending as revision request' : 'Send as feedback only'}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
              markAsRevision
                ? 'bg-status-warning/15 text-status-warning ring-1 ring-status-warning/40'
                : 'bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <AlertTriangle size={13} />
            {markAsRevision ? 'Revision' : 'Mark as revision'}
          </button>
          <button
            type="button"
            onClick={() => submit(markAsRevision ? 'changes_requested' : 'comment')}
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
            data-tour="approve"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-status-success px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-all hover:opacity-90 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 sm:flex-none sm:py-2"
          >
            <CheckCircle size={14} /> Approve
          </button>
        )}
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

  // Post-migration 302 project_type is binary (editing | calendar). Both
  // default to 9:16; image deliverables get a 4:5 column. The media column
  // drives its own height via `aspect-[...]`; the card hugs whichever side
  // is taller (`md:items-stretch`) so the video frame stays flush with the
  // card edges (no letterboxing) and the comment thread renders inline
  // instead of inside a scroll well.
  void projectType;
  const videoColAspect = isImage ? 'aspect-[4/5]' : 'aspect-[9/16]';
  // Width caps mirror the prior visual scale (~78vh tall x aspect-ratio).
  // `md:self-start` keeps the media column at its intrinsic aspect-ratio
  // height; the comments rail stretches to fill, kept off the bottom edge.
  const videoColSizing = isImage
    ? 'w-full md:w-[44vh] md:max-w-[480px] md:flex-shrink-0 md:self-start'
    : 'w-full md:w-[44vh] md:max-w-[440px] md:flex-shrink-0 md:self-start';
  return (
    <article
      id={`video-${index}`}
      className="flex flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface md:flex-row md:items-stretch"
    >
      {revisionInput}
      <div
        className={`${videoColAspect} ${videoColSizing} ${
          isImage ? 'bg-surface' : 'bg-black'
        }`}
      >
        {videoPanel}
      </div>
      <div className="flex flex-1 flex-col md:min-w-0">
        <div className="p-3 sm:p-4">{headerBlock}</div>
        {historyBlock}
        <div className="flex-1" />
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
  // Auto-approval inference was removed 2026-05-14. Old rows with
  // `metadata.auto_approved` render as plain approvals.

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
          <RoleChip role={comment.author_role} />
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
  const trailingMeta = isResolved ? 'marked revised · ' : '';
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
        <RoleChip role={comment.author_role} />
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
          className="h-24 w-24 bg-black object-cover"
          muted
          playsInline
          // preload=metadata pulls the first frame so the video tile shows
          // a poster instead of a black square next to image tiles.
          preload="metadata"
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

/**
 * Inline-editable display name for a clip on the editing-project share
 * link. Click to enter edit mode, Enter / Save commits, Esc reverts.
 * Empty input clears the override and the viewer falls back to the
 * uploaded filename. Mirrors the social-ad TitleEditor in /c/[token].
 */
function ClipTitleEditor({
  token,
  videoId,
  title,
  fallback,
  displayTitle,
  onSaved,
  requireName,
  hasName,
}: {
  token: string;
  videoId: string;
  title: string | null;
  fallback: string | null;
  displayTitle: string;
  onSaved: (title: string | null) => void;
  requireName: () => void;
  hasName: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? fallback ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const next = draft.trim();
    if (next === (title ?? fallback ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/editing/share/${token}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, title: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to save title');
      }
      onSaved((json.title as string | null) ?? null);
      toast.success('Title saved');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save title');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Type size={14} className="text-text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              setDraft(title ?? fallback ?? '');
              setEditing(false);
            }
          }}
          autoFocus
          disabled={saving}
          maxLength={160}
          placeholder={fallback ?? 'Clip title'}
          className="flex-1 rounded-md border border-accent/40 bg-background/60 px-2 py-1 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(title ?? fallback ?? '');
            setEditing(false);
          }}
          disabled={saving}
          className="inline-flex items-center rounded-md border border-nativz-border bg-transparent px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (!hasName) {
            requireName();
            return;
          }
          setDraft(title ?? fallback ?? '');
          setEditing(true);
        }}
        title="Click to rename"
        className="flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-left text-[15px] font-medium leading-snug text-text-primary transition-colors hover:border-nativz-border hover:bg-surface-hover"
      >
        {displayTitle}
      </button>
      <Pencil
        size={11}
        className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
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

/**
 * Resolves the best download URL for a shared asset.
 *
 *   - Mux videos → capped-1080p MP4 rendition (matches the upload's
 *     `mp4_support: 'capped-1080p'` setting). HLS playback URLs aren't
 *     useful as a direct download.
 *   - Pre-Mux videos + images → the original Supabase Storage public URL.
 */
function getDownloadUrl(v: SharedVideo): string | null {
  if (v.mux_playback_id) {
    return `https://stream.mux.com/${v.mux_playback_id}/capped-1080p.mp4`;
  }
  return v.public_url ?? null;
}

function getDownloadFilename(v: SharedVideo, idx: number): string {
  if (v.filename) return v.filename;
  const isImage = (v.mime_type ?? '').startsWith('image/');
  const ext = isImage ? 'png' : 'mp4';
  return `cut-${idx + 1}.${ext}`;
}

// Two cuts can legitimately share a `filename` (e.g. multiple revisions
// of "final.mp4"). JSZip silently overwrites entries with the same key,
// which would drop files from the bundle. Append " (n)" before the
// extension on collisions.
function uniqueZipName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while (used.has(`${stem} (${n})${ext}`)) n++;
  const final = `${stem} (${n})${ext}`;
  used.add(final);
  return final;
}

function buildZipFilename(client: string, project: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  const parts = [slug(client), slug(project)].filter(Boolean);
  return `${parts.join('-') || 'cuts'}.zip`;
}

/**
 * Cross-origin friendly download: fetch as blob, mint an object URL, click
 * a synthetic anchor. The `download` HTML attribute is ignored on most
 * cross-origin assets (Mux, Supabase Storage public bucket), so we go via
 * blob to guarantee an actual save instead of a navigation.
 */
async function downloadAsset(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
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

/**
 * Editable share-link H1. Mirrors ProjectNameHeader on the SMM share
 * page (app/c/[token]/page.tsx): admins see a hover-pencil that flips
 * the title into an inline input; PATCH lands on the share link row
 * (/api/editing/review/{shareLinkId}) so the underlying project name
 * is untouched. Non-admins see a static title.
 */
function ProjectNameHeader({
  name,
  fallback,
  isEditor,
  shareLinkId,
  onRenamed,
}: {
  name: string | null;
  fallback: string;
  isEditor: boolean;
  shareLinkId: string;
  onRenamed: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(name ?? '');
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const headingClass =
    'font-display text-xl font-semibold tracking-tight text-text-primary sm:text-3xl';

  if (!isEditor) {
    // `block truncate` keeps the heading on a single line and ellipsises
    // when the title is longer than the column. Without this, a long
    // share-link name would force the row to grow and shove the action
    // cluster onto a new line.
    return (
      <h1 className={`${headingClass} block w-full max-w-full truncate`}>
        {name ?? fallback}
      </h1>
    );
  }

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setEditing(false);
    if (next === (name ?? null)) return;
    const prev = name ?? null;
    onRenamed(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/editing/review/${shareLinkId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Rename failed');
      }
      toast.success('Project name updated');
    } catch (err) {
      onRenamed(prev);
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(name ?? '');
            setEditing(false);
          }
        }}
        placeholder={fallback}
        disabled={saving}
        maxLength={120}
        className={`${headingClass} w-full max-w-full rounded-md border border-nativz-border bg-transparent px-2 py-1 outline-none focus:border-accent`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name ?? '');
        setEditing(true);
      }}
      className="group flex w-full min-w-0 max-w-full items-center gap-2 rounded-md text-left transition-colors hover:text-text-primary"
      title="Rename"
    >
      <span className={`${headingClass} block min-w-0 flex-1 truncate`}>
        {name ?? fallback}
      </span>
      <Pencil
        size={16}
        className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
