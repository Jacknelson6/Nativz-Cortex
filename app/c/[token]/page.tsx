'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle, AlertTriangle, AtSign, BellRing, CalendarDays, CheckCircle, Clock,
  Download, Eye, EyeOff, File as FileIcon, Film, ImageUp, List, Loader2, LogIn, MapPin, MessageSquare,
  Paperclip, Pencil, Play, Plus, RefreshCw, RotateCcw, Send, Tag, Trash2, Type, Undo2,
  Upload, Users, VideoOff, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import type { DeliverableBalance } from '@/lib/deliverables/get-balances';
import type { AddonSku } from '@/lib/deliverables/addon-skus';
import { thumbUrl } from '@/lib/calendar/thumb-url';
import { ShareTour, ShareTourLaunchButton, CALENDAR_SHARE_BEATS } from '@/components/share/share-tour';
import {
  ShareGatewayModal,
  readGuestName,
  clearGuestName,
} from '@/components/share/gateway-modal';
import { RoleChip } from '@/components/share/role-chip';
import {
  AttachmentChip,
  CommentAttachmentTile,
} from '@/components/share/comment-attachments';
import { resolveCommentStyle } from '@/lib/share/comment-style';

const CALENDAR_TOUR_STORAGE_KEY = 'cortex.share.calendarTourSeen';
import { mergeCaptionAndHashtags } from '@/lib/scheduler/caption-hashtags';

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
  | 'comment'
  | 'caption_edit'
  | 'tag_edit'
  | 'schedule_change'
  | 'video_revised'
  | 'cover_edit';

interface SharedComment {
  id: string;
  review_link_id: string;
  author_name: string;
  // PRD 05: server-enforced role tag. Drives the team/client/guest chip on
  // every comment row. Falls back to 'guest' for pre-migration rows.
  author_role: 'admin' | 'viewer' | 'guest';
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
  // NAT-73: when set, this row is a reply that should render under the
  // parent comment instead of as a fresh thread. One level of nesting
  // only; the API rejects replies-to-replies.
  parent_comment_id: string | null;
}

interface SharedAsset {
  id: string;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  position: number;
  status: string;
}

interface SharedPost {
  id: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  video_url: string | null;
  // 'video' (default, single video per post) or 'image' (1..N image assets in
  // the assets[] array, single image when assets.length === 1, carousel when
  // length > 1). Image posts skip the Mux/<video> branches entirely.
  media_type: 'video' | 'image';
  assets: SharedAsset[];
  tagged_people: string[];
  collaborator_handles: string[];
  // For ad / "other" project types we surface an editable title instead of
  // a caption. `title` is the override (nullable), `filename_fallback` is
  // the upload's original filename minus extension, used when the editor
  // hasn't typed a title yet so the viewer always has something to show.
  title: string | null;
  filename_fallback: string | null;
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

// Drives per-creative layout: calendar uses the 9:16 + caption flow;
// editing swaps caption for an editable title (no schedule, no handles).
// Falls back to calendar for legacy share links that predate the
// project_type column. Migration 302 collapsed this to a binary; the
// API's normalizeProjectType() folds pre-migration values onto these
// two before they reach the page.
type ShareProjectType = 'editing' | 'calendar';

interface SharedDrop {
  /** Client UUID, used by the soft-block modal as the Stripe checkout subject. */
  clientId: string;
  clientName: string;
  /**
   * Share-link UUID. Editor-only inline-rename in the viewer header
   * PATCHes the same /api/calendar/review/{id} endpoint the portal
   * "Your reviews" table uses, so the title stays in sync across both
   * surfaces without duplicating endpoints.
   */
  shareLinkId: string;
  /**
   * Editable per-share name (the same value the portal "Your reviews"
   * table renders as the project-name column). When set, the viewer
   * header uses this verbatim instead of the generic
   * "<Brand>, Content calendar" fallback so the title the viewer sees
   * matches what the admin / portal user typed.
   */
  projectName: string | null;
  isEditor: boolean;
  projectType: ShareProjectType;
  projectTypeOther: string | null;
  drop: { id: string; start_date: string; end_date: string; default_post_time: string };
  posts: SharedPost[];
  expiresAt: string;
  // Per-type deliverable balances feeding the BalancePill near the approve
  // buttons. Empty array when no active types are configured for the client
  // (brand-new account); pill hides itself in that case.
  balances: DeliverableBalance[];
  /** Phase D soft-block: configured add-on SKUs for this client's agency. */
  addons: AddonSku[];
  /** Phase D soft-block: agency support email surfaced as the "Talk to AM" CTA. */
  supportEmail: string;
}

type ReviewStatus = 'approved' | 'revising' | null;
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
            ? (readGuestName(token) ||
                (window.localStorage.getItem(`cortex_share_name_${token}`)?.trim() ?? ''))
            : '';
        const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
        const res = await fetch(`/api/calendar/share/${token}${qs}`);
        const json = await readJsonSafe(res);
        if (!res.ok) {
          throw new Error(
            (json && typeof json.error === 'string' ? json.error : null) ??
              `Link unavailable (${res.status})`,
          );
        }
        if (!json) throw new Error('Empty response from server');
        if (!cancelled) setData(json as unknown as SharedDrop);
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
          <h1 className="text-lg font-semibold text-text-primary">{toFriendlyShareError(error)}</h1>
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
  const legacyStorageKey = `cortex_share_name_${token}`;
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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  // PRD 06 §"View as client": admins flip this to preview the page
  // without admin chrome. Local-only, does not change server identity.
  const [viewAsClient, setViewAsClient] = useState(false);
  const effectiveIsEditor = data.isEditor && !viewAsClient;

  // PRD 02 §"Server resolution" + PRD 03 §"Guest persistence". On mount,
  // ask the server who's logged in. If the session auto-binds to the
  // share link's agency we skip the modal entirely; otherwise fall back
  // to the persisted guest name (new key first, legacy key second so
  // returning visitors don't get prompted again).
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
        // Identity probe failure is non-fatal; legacy guest name (if any)
        // still works, and the share data fetch will surface terminal
        // states. Fall through to the legacy guest-name read so we don't
        // strand a returning visitor at a blank screen.
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

  // Re-runs the identity probe after a successful login. Lifted out so
  // the gateway's onLoggedIn can refresh the bound identity + role chip
  // without duplicating the probe wiring.
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
      /* probe failure is non-fatal */
    }
  }

  // "Switch identity" affordance. Bound sessions sign out via DELETE so
  // a stale Cortex cookie doesn't auto-re-bind on the next reload; guest
  // sessions clear the persisted name so the modal starts fresh. Both
  // paths land on the gateway's "choose" view.
  async function handleSwitchIdentity() {
    if (boundIdentity) {
      try {
        await fetch(`/api/share/${token}/auth/login`, { method: 'DELETE' });
      } catch {
        /* ignore, modal will still show */
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

  // Show unscheduled posts at the top, then chronological by scheduled_at
  // ascending. Mirrors how editors think about the timeline.
  const sortedPosts = useMemo(() => sortPostsForList(data.posts), [data.posts]);

  // Deep-link support: webhook chat pings include `#post-N` so the link
  // jumps straight to the post under discussion. Browsers only auto-scroll
  // on initial nav if the element is already in the DOM, so we re-run after
  // the post list materializes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#post-')) return;
    if (sortedPosts.length === 0) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [sortedPosts.length]);

  const total = data.posts.length;
  const approvedCount = data.posts.filter((p) => latestReview(p.comments) === 'approved').length;
  const changesCount = data.posts.filter((p) => latestReview(p.comments) === 'revising').length;
  const unapprovedPosts = useMemo(
    () => data.posts.filter((p) => latestReview(p.comments) !== 'approved'),
    [data.posts],
  );
  const pendingRevisionCount = data.isEditor
    ? data.posts.filter((p) => p.revised_video_notify_pending).length
    : 0;
  const expiresLabel = useMemo(() => {
    const d = new Date(data.expiresAt);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [data.expiresAt]);

  // Flatten every post into the per-asset download targets the zip
  // bundler needs. Video posts contribute one mp4 (Mux capped-1080p when
  // available, falling back to the legacy revised_video_url / video_url);
  // image posts contribute one entry per asset (carousels expand). Posts
  // with no usable URL yet are silently dropped from the count.
  const downloadTargets = useMemo(
    () => sortedPosts.flatMap((p, idx) => buildPostDownloadTargets(p, idx)),
    [sortedPosts],
  );
  const downloadableCount = downloadTargets.length;

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

  // Bulk approve every post that's still pending. Sequential rather than
  // parallel so the existing per-post pipeline (Monday sync, Zernio publish,
  // 🎉 chat ping when the *last* approval lands) sees each insert in order
  // and the documented allApproved race only fires once at the end.
  async function approveAll() {
    if (!authorName.trim()) {
      setGatewayOpen(true);
      return;
    }
    const targets = data.posts.filter((p) => latestReview(p.comments) !== 'approved');
    if (targets.length === 0) return;

    setApprovingAll(true);
    const toastId = toast.loading(`Approving 0 of ${targets.length}…`);
    let done = 0;
    let failed = 0;
    try {
      for (const post of targets) {
        try {
          const res = await fetch(`/api/calendar/share/${token}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postId: post.id,
              authorName: authorName.trim(),
              content: 'Approved',
              status: 'approved',
              attachments: [],
              timestampSeconds: null,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed');
          appendComment(post.id, json.comment as SharedComment);
          done++;
        } catch {
          failed++;
        }
        toast.loading(
          `Approving ${done + failed} of ${targets.length}…`,
          { id: toastId },
        );
      }
      if (failed === 0) {
        toast.success(`Approved ${done} post${done === 1 ? '' : 's'}`, { id: toastId });
      } else if (done === 0) {
        toast.error(`Could not approve any posts. Try again.`, { id: toastId });
      } else {
        toast.error(`Approved ${done}, ${failed} failed.`, { id: toastId });
      }
    } finally {
      setApprovingAll(false);
    }
  }

  // Bundle every available post asset into a single zip and trigger one
  // download. Mirrors the editing share page so calendar reviewers can pull
  // every approved cut + carousel image in one go instead of fighting the
  // browser's popup blocker on N anchor clicks. Lazy-imports jszip to keep
  // the share-page bundle light for visitors who never click download.
  async function handleDownloadAll() {
    if (downloadingAll) return;
    if (downloadTargets.length === 0) {
      toast.error('Nothing to download yet.');
      return;
    }
    setDownloadingAll(true);
    const toastId = toast.loading(`Fetching 0 of ${downloadTargets.length}…`);
    let fetched = 0;
    let failed = 0;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const usedNames = new Set<string>();
      await Promise.all(
        downloadTargets.map(async (t) => {
          try {
            const res = await fetch(t.url);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const buf = await res.arrayBuffer();
            const name = uniqueZipName(usedNames, t.filename);
            // h264 + jpeg/png are pre-compressed; STORE skips the DEFLATE pass
            // so we don't burn CPU re-compressing incompressible bytes.
            zip.file(name, buf, { binary: true, compression: 'STORE' });
            fetched++;
          } catch {
            failed++;
          } finally {
            toast.loading(
              `Fetching ${fetched + failed} of ${downloadTargets.length}…`,
              { id: toastId },
            );
          }
        }),
      );
      if (fetched === 0) {
        toast.error('Could not download any files. Try again.', { id: toastId });
        return;
      }
      toast.loading('Building zip…', { id: toastId });
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const zipName = buildSmmZipFilename(data.clientName, data.drop.start_date, data.drop.end_date);
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
        toast.success(`Zipped ${fetched} file${fetched === 1 ? '' : 's'}`, { id: toastId });
      } else {
        toast.error(`Zipped ${fetched}, ${failed} failed.`, { id: toastId });
      }
    } catch (err) {
      console.error('[handleDownloadAll] zip failed', err);
      toast.error('Could not build zip. Try again.', { id: toastId });
    } finally {
      setDownloadingAll(false);
    }
  }

  function updatePostCaption(
    postId: string,
    caption: string,
    hashtags: string[],
    comment: SharedComment,
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId
                ? { ...p, caption, hashtags, comments: [...p.comments, comment] }
                : p,
            ),
          }
        : prev,
    );
  }

  function updatePostTitle(postId: string, title: string | null) {
    // Title edits don't generate a comment row (caption edits do); we just
    // mutate the row in place so the chip + sort label re-render.
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === postId ? { ...p, title } : p,
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
                    // For Mux uploads we don't have a playback URL yet, clear
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

  // Editor-only "remove from calendar", strips the post from this share
  // link's `included_post_ids` server-side, then optimistically drops it
  // from the in-memory list so the card disappears immediately. Reversible
  // from admin UI (we don't delete the underlying scheduled_post or
  // drop_video, just unlink it from this share link).
  function removePostFromCalendar(postId: string) {
    setData((prev) =>
      prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== postId) } : prev,
    );
  }

  // Image-replace: swap the asset row's url + mime in-memory after the
  // server endpoint repoints content_drop_post_assets and busts the
  // scheduler_media feed-normalized cache. Single-asset posts only, that's
  // the only case the Replace UI exposes today (carousels need a per-frame
  // selector). Width/height clear so any consumer that branches on them
  // doesn't render the OLD aspect ratio against the NEW image.
  function updatePostImageAsset(
    postId: string,
    next: { url: string; mime_type: string | null },
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) => {
              if (p.id !== postId) return p;
              if (p.media_type !== 'image' || p.assets.length === 0) return p;
              const target = p.assets[0];
              const updated: SharedAsset = {
                ...target,
                url: next.url,
                thumbnail_url: next.url,
                mime_type: next.mime_type,
                width: null,
                height: null,
                status: 'pending_review',
              };
              return { ...p, assets: [updated, ...p.assets.slice(1)] };
            }),
          }
        : prev,
    );
  }

  // Cover-photo set/clear: video posts only. The new url goes into
  // cover_image_url so the publish pipeline (lib/calendar/schedule-drop.ts ->
  // lib/posting/zernio.ts) picks it up as the IG/FB/LinkedIn thumbnail on
  // its next run. We also splice in the post_review_comments row the API
  // returned so the activity rail shows "Updated the cover photo" without
  // a refetch.
  function updatePostCover(
    postId: string,
    nextCoverUrl: string | null,
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
                    cover_image_url: nextCoverUrl,
                    comments: comment ? [...p.comments, comment] : p.comments,
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
          ? (readGuestName(token) ||
              window.localStorage.getItem(legacyStorageKey)?.trim() ||
              authorName.trim())
          : authorName.trim();
      const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
      const res = await fetch(`/api/calendar/share/${token}${qs}`);
      const json = await readJsonSafe(res);
      if (res.ok && json) setData(() => json as unknown as SharedDrop);
    } catch {
      // refetch failure is non-fatal; UI keeps the optimistic state
    }
  }

  // Auto-poll the share endpoint while any post is mid-Mux-pipeline
  // (uploading or processing). The share GET endpoint runs reconcileMuxRow
  // against the Mux API on every hit, so polling is also our self-heal
  // path when the asset.ready webhook fails to land in production. The
  // poll interval grows over time so we don't hammer the API for the
  // long tail (large files, busy Mux), and resumes when the tab regains
  // focus so a re-check fires immediately after the user comes back to
  // the page rather than sitting on a stale placeholder.
  const hasInFlightMux = useMemo(
    () =>
      data.posts.some(
        (p) => p.mux_status === 'processing' || p.mux_status === 'uploading',
      ),
    [data.posts],
  );
  useEffect(() => {
    if (!hasInFlightMux) return;
    const startedAt = Date.now();
    // 30 minutes covers slow MP4 rendition packaging on larger files.
    // Mux short-form typically finishes in <1 min, but the publish cron
    // needs revised_mp4_url which can lag the HLS playback id.
    const MAX_MS = 30 * 60 * 1000;
    let timer: number | null = null;

    function intervalFor(elapsed: number): number {
      if (elapsed < 60_000) return 5_000;
      if (elapsed < 5 * 60_000) return 10_000;
      return 30_000;
    }

    function tick() {
      const elapsed = Date.now() - startedAt;
      if (elapsed > MAX_MS) {
        if (timer != null) window.clearTimeout(timer);
        return;
      }
      void refetch();
      timer = window.setTimeout(tick, intervalFor(elapsed));
    }

    timer = window.setTimeout(tick, intervalFor(0));

    // Re-check immediately on tab focus, in case the webhook landed
    // while the page was backgrounded and our last poll missed it.
    function onFocus() {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    }
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // refetch is a stable closure over token/storageKey/setData, all of
    // which are stable inside this component. Re-running the effect on
    // every render would reset the timer, defeating the point of polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInFlightMux]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface px-4 py-7 sm:px-8 sm:py-9">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center sm:mb-7">
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
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-4 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              {/*
                Mirrors the portal "Your reviews" project-name column.
                When the admin renames the share link there the same
                string lands here, and editors can rename it inline from
                this header. Both surfaces PATCH the same review row
                (/api/calendar/review/{shareLinkId}) so they stay in
                lockstep without duplicating endpoints. Non-editors see
                a static title only.
              */}
              <ProjectNameHeader
                projectName={data.projectName}
                fallback={`${data.clientName}, content calendar`}
                isEditor={data.isEditor}
                shareLinkId={data.shareLinkId}
                onRenamed={(next) =>
                  setData((prev) => (prev ? { ...prev, projectName: next } : prev))
                }
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <p className="truncate text-sm text-text-secondary sm:text-base">
                  {total} post{total !== 1 ? 's' : ''} to review · scheduled {formatDropDateRange(data.drop.start_date, data.drop.end_date)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:ml-auto md:flex-nowrap">
              {/*
                Editor-recovery pill. Hidden when the viewer is already a
                signed-in admin (Replace/Remove affordances live next to
                each post). When NULL, gives any Nativz teammate looking at
                this share link a one-tap path back to their signed-in
                editor state. Common case: the link was opened on a
                brand-vanity subdomain (e.g. cortex.andersoncollaborative.com)
                where the Nativz Supabase cookie isn't scoped, so isEditor
                comes back false and the team member can't see Replace.
                Round-trip to /login?next=<current path> mints the session
                on this subdomain and returns them to the same review screen.
              */}
              {!data.isEditor && (
                <a
                  href={`/login?next=${encodeURIComponent(`/c/${token}`)}`}
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
                <ShareTourLaunchButton storageKey={CALENDAR_TOUR_STORAGE_KEY} />
              )}
              {downloadableCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleDownloadAll()}
                  disabled={downloadingAll}
                  className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  title={`Download ${downloadableCount} file${downloadableCount === 1 ? '' : 's'} as a single zip`}
                >
                  {downloadingAll ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span className="hidden sm:inline">
                    {downloadingAll ? 'Preparing zip…' : `Download all (${downloadableCount})`}
                  </span>
                  <span className="sm:hidden">
                    {downloadingAll ? '…' : `Download (${downloadableCount})`}
                  </span>
                </button>
              )}
              {unapprovedPosts.length > 0 && (
                <button
                  type="button"
                  data-tour="cal-approve-all"
                  onClick={() => {
                    if (!authorName.trim()) {
                      setGatewayOpen(true);
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
                    {approvingAll ? 'Approving…' : `Approve all (${unapprovedPosts.length})`}
                  </span>
                  <span className="sm:hidden">
                    {approvingAll ? '…' : `Approve all (${unapprovedPosts.length})`}
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
          <div className="mt-7 flex flex-wrap items-center gap-2 text-[13px] sm:text-sm">
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
        {viewMode === 'list' ? (
          <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
            {sortedPosts.map((post, idx) => (
              <PostCard
                key={post.id}
                index={idx + 1}
                post={post}
                projectType={data.projectType}
                isEditor={effectiveIsEditor}
                defaultPostTime={data.drop.default_post_time}
                token={token}
                authorName={authorName}
                onCommentAdded={(c) => appendComment(post.id, c)}
                onCommentRemoved={(commentId) => removeComment(post.id, commentId)}
                onCommentUpdated={(c) => updateComment(post.id, c)}
                onCaptionUpdated={(caption, hashtags, c) =>
                  updatePostCaption(post.id, caption, hashtags, c)
                }
                onHandlesUpdated={(field, next, c) => updatePostHandles(post.id, field, next, c)}
                onScheduleUpdated={(at, c) => updatePostScheduledAt(post.id, at, c)}
                onRevisionUploaded={(rev) => updatePostRevision(post.id, rev)}
                onAssetReplaced={(next) => updatePostImageAsset(post.id, next)}
                onCoverUpdated={(nextCover, c) => updatePostCover(post.id, nextCover, c)}
                onRemoveFromCalendar={() => removePostFromCalendar(post.id)}
                onTitleUpdated={(title) => updatePostTitle(post.id, title)}
                requireName={() => {
                  setGatewayOpen(true);
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
              setGatewayOpen(true);
            }}
          />
        )}

        {/* Page-level "+ Add new video" trigger. Editor-only. Opens the
            Mux upload + AI caption + schedule modal. Sits below the list /
            calendar so it reads as "add another to this batch" rather than
            attaching to any one post. */}
        {effectiveIsEditor && (
          <div className="mx-auto mt-4 flex max-w-6xl justify-center sm:mt-6">
            <button
              type="button"
              onClick={() => setAddVideoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-nativz-border bg-transparent px-4 py-2 text-sm font-medium text-text-muted transition-all hover:border-accent/50 hover:bg-accent-surface hover:text-accent-text"
            >
              <Plus size={14} /> Add new video
            </button>
          </div>
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

      <ShareGatewayModal
        open={gatewayOpen}
        token={token}
        agencyMismatch={gatewayInfo.agencyMismatch}
        agencyAvailable={gatewayInfo.agencyAvailable}
        defaultGuestName={authorName}
        onLoggedIn={async () => {
          // Cookie is set; re-run identity probe so we pick up the
          // bound display name + role and skip the modal going forward.
          await reprobeIdentity();
          setGatewayOpen(false);
          await refetch();
        }}
        onGuestNamed={(name) => {
          setAuthorName(name);
          // PRD 03 §"Persistence": stash under the legacy key too so the
          // outer ?as= read on a hard reload finds it without a second
          // identity round-trip. Safe no-op if storage is blocked.
          try {
            window.localStorage.setItem(legacyStorageKey, name);
          } catch {
            /* ignore */
          }
          setGatewayOpen(false);
        }}
      />

      <PostDetailModal
        post={detailPostId ? sortedPosts.find((p) => p.id === detailPostId) ?? null : null}
        index={detailPostId ? sortedPosts.findIndex((p) => p.id === detailPostId) + 1 : 0}
        projectType={data.projectType}
        isEditor={effectiveIsEditor}
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
        onAssetReplaced={updatePostImageAsset}
        onCoverUpdated={updatePostCover}
        onRemoveFromCalendar={removePostFromCalendar}
        onTitleUpdated={updatePostTitle}
        onClose={() => setDetailPostId(null)}
        requireName={() => setGatewayOpen(true)}
      />

      {data.isEditor && (
        <AddVideoModal
          open={addVideoOpen}
          onClose={() => setAddVideoOpen(false)}
          token={token}
          drop={data.drop}
          existingScheduledAt={data.posts.map((p) => p.scheduled_at).filter((s): s is string => !!s)}
          onDone={async () => {
            setAddVideoOpen(false);
            await refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={approveAllOpen}
        title={`Approve all ${unapprovedPosts.length} post${unapprovedPosts.length === 1 ? '' : 's'}?`}
        description="This signs off on every post that's still pending. Posts already marked changes requested will also be approved. You can still leave comments after."
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

      <ShareTour
        enabled={!gatewayOpen && data.posts.length > 0}
        beats={CALENDAR_SHARE_BEATS}
        storageKey={CALENDAR_TOUR_STORAGE_KEY}
      />
    </div>
  );
}

/**
 * Editable share-link H1. Mirrors the inline-rename UX from the portal
 * "Your reviews" table (components/scheduler/review-table.tsx → NameCell)
 * but renders as a large header instead of a table cell. Both surfaces
 * PATCH the same row (/api/calendar/review/{shareLinkId}) with `{ name }`
 * so renames stay in lockstep. Empty input clears back to fallback.
 */
function ProjectNameHeader({
  projectName,
  fallback,
  isEditor,
  shareLinkId,
  onRenamed,
}: {
  projectName: string | null;
  fallback: string;
  isEditor: boolean;
  shareLinkId: string;
  onRenamed: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep draft in sync when the canonical value changes from elsewhere
  // (e.g. another tab/portal rename, polling refetch).
  useEffect(() => {
    if (!editing) setDraft(projectName ?? '');
  }, [projectName, editing]);

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
        {projectName ?? fallback}
      </h1>
    );
  }

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setEditing(false);
    if (next === (projectName ?? null)) return;
    const prev = projectName ?? null;
    onRenamed(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/review/${shareLinkId}`, {
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
      onRenamed(prev); // rollback
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
            setDraft(projectName ?? '');
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
        setDraft(projectName ?? '');
        setEditing(true);
      }}
      className="group flex w-full min-w-0 max-w-full items-center gap-2 rounded-md text-left transition-colors hover:text-text-primary"
      title="Rename"
    >
      <span className={`${headingClass} block min-w-0 flex-1 truncate`}>
        {projectName ?? fallback}
      </span>
      <Pencil
        size={16}
        className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
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

function latestReview(comments: SharedComment[]): ReviewStatus {
  // Walk newest to oldest. Hit 'approved' first: approved. Hit 'comment'
  // before any approval (or no approval ever): revising. Activity-event
  // statuses (caption_edit, tag_edit, cover_edit, schedule_change,
  // video_revised) are skipped since they don't affect approval state.
  const ACTIVITY = new Set(['caption_edit', 'tag_edit', 'cover_edit', 'schedule_change', 'video_revised']);
  let lastApprovalIdx = -1;
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].status === 'approved') { lastApprovalIdx = i; break; }
  }
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (ACTIVITY.has(c.status)) continue;
    if (c.status === 'approved') return 'approved';
    if (c.status === 'comment' && i > lastApprovalIdx) return 'revising';
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
        // Best-effort resume, promise rejects on autoplay policy violations,
        // which are fine to swallow (the user clicked, so a play() following
        // a click should usually go through; if not, the seek already moved
        // the playhead and the user can hit play themselves).
        const playResult = el.play?.();
        if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
          (playResult as Promise<void>).catch(() => {});
        }
      } catch {
        // Player may not be ready yet, silently no-op.
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

/**
 * Render a "May 1 to May 31" string from two YYYY-MM-DD date-only inputs.
 * We construct the Date in local time (not UTC) so a "2026-05-01" input
 * doesn't get pulled back to April in negative-UTC zones. Year is appended
 * only when the range crosses a year boundary.
 */
function formatDropDateRange(start: string, end: string): string {
  const parse = (yyyymmdd: string) => {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  };
  const a = parse(start);
  const b = parse(end);
  const sameYear = a.getFullYear() === b.getFullYear();
  const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const withYear = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return sameYear ? `${dayMonth(a)} to ${dayMonth(b)}` : `${withYear(a)} to ${withYear(b)}`;
}

function VideoSurface({
  post,
  autoPlay = false,
  className,
  aspectClass = 'aspect-[9/16]',
  aspectRatioStyle = '9 / 16',
  onPlayerReady,
}: {
  post: VideoSurfacePost;
  autoPlay?: boolean | 'muted' | 'any';
  className?: string;
  // Tailwind aspect class used by the placeholder/overlay branches. Defaults
  // to 9:16 to preserve organic short-form behavior; ad-type viewers pass
  // 'aspect-square' (Social Ads) or 'aspect-video' (CTV Ads) instead.
  aspectClass?: string;
  // Inline CSS aspect ratio used by Mux Player's style prop, Mux's element
  // doesn't pick up Tailwind classes for sizing, so we drive it explicitly.
  aspectRatioStyle?: string;
  // Handed a handle when the underlying media element mounts, and `null`
  // when it unmounts. Optional, most callers (calendar grid thumbs, lightbox)
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

  // Native error chrome on <video> ("A network error caused the media
  // download to fail.") and Mux's red flash both look hostile on a brand
  // share link. We swallow them here, render a Cortex-toned overlay, and
  // expose a Retry button that remounts the player. Bumping `retryKey`
  // forces React to discard the failed element and try the source fresh.
  const [errored, setErrored] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const handleRetry = () => {
    setErrored(false);
    setRetryKey((k) => k + 1);
  };

  if (errored && (post.mux_playback_id || post.video_url)) {
    const muxThumb = post.mux_playback_id
      ? `https://image.mux.com/${post.mux_playback_id}/thumbnail.jpg?width=720&fit_mode=preserve&time=1`
      : null;
    const posterUrl = muxThumb ?? post.cover_image_url ?? null;
    return (
      <div className={`relative ${aspectClass} w-full overflow-hidden bg-black ${className ?? ''}`}>
        {posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="rounded-2xl bg-black/55 px-5 py-4 text-center text-white backdrop-blur-md ring-1 ring-white/10 max-w-[20rem]">
            <VideoOff className="mx-auto mb-2 text-white/80" size={26} />
            <p className="text-sm font-medium">Couldn&apos;t load this video</p>
            <p className="mt-0.5 text-[11px] text-white/70">
              The connection dropped or the source is unavailable. Try again, usually it&apos;s a transient hiccup.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/25"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (post.mux_playback_id) {
    return (
      <MuxPlayer
        // MuxPlayer's ref points at the <mux-player> custom element, which
        // mirrors HTMLVideoElement enough for currentTime/play().
        ref={attachPlayer as never}
        key={`mux-${post.mux_playback_id}-${retryKey}`}
        streamType="on-demand"
        playbackId={post.mux_playback_id}
        autoPlay={autoPlay}
        accentColor="var(--accent)"
        poster={post.cover_image_url ?? undefined}
        // Aspect ratio is driven by project type (9:16 organic / 1:1 social
        // ad / 16:9 CTV / 9:16 other), see PostCard for the mapping.
        style={{ aspectRatio: aspectRatioStyle, maxHeight: 'inherit', width: '100%' }}
        className={className}
        // Disable Mux's default end-screen + remote playback chrome, keeps
        // the share-link surface focused on review, not branded promo.
        metadata={{ player_name: 'cortex-share' }}
        onError={() => setErrored(true)}
      />
    );
  }
  if (post.mux_status === 'processing' || post.mux_status === 'uploading') {
    // Layer the "processing" overlay on top of whatever poster we have for
    // the previous cut so the card never goes to a black void mid-replace.
    // Preference order:
    //   1. Previous Mux thumbnail (most accurate, same frame the player
    //      would show when the previous cut loaded). Image.mux.com is a
    //      public endpoint, no auth needed.
    //   2. cover_image_url from the original post (Drive cover).
    //   3. Plain black, with the loader still readable.
    const muxThumb = post.mux_playback_id
      ? `https://image.mux.com/${post.mux_playback_id}/thumbnail.jpg?width=720&fit_mode=preserve&time=1`
      : null;
    const posterUrl = muxThumb ?? post.cover_image_url ?? null;
    return (
      <div className={`relative ${aspectClass} w-full overflow-hidden bg-black ${className ?? ''}`}>
        {posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl bg-black/55 px-5 py-4 text-center text-white backdrop-blur-md ring-1 ring-white/10">
            <Loader2 className="mx-auto mb-2 animate-spin" size={28} />
            <p className="text-sm font-medium">Processing the new cut…</p>
            <p className="mt-0.5 text-[11px] text-white/70">
              Usually takes about a minute. This will update on its own.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (post.video_url) {
    // Legacy (pre-Mux) videos render through MuxPlayer with `src` so the
    // share-page chrome stays consistent (branded scrub bar, accent color,
    // unified error handling). MuxPlayer falls back to HTMLMediaElement
    // playback when given a plain URL, no HLS / static rendition required.
    return (
      <MuxPlayer
        ref={attachPlayer as never}
        key={`legacy-${post.video_url}-${retryKey}`}
        src={post.video_url}
        streamType="on-demand"
        autoPlay={autoPlay}
        accentColor="var(--accent)"
        poster={post.cover_image_url ?? undefined}
        style={{ aspectRatio: aspectRatioStyle, maxHeight: 'inherit', width: '100%' }}
        className={className}
        metadata={{ player_name: 'cortex-share-legacy' }}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className={`flex ${aspectClass} w-full items-center justify-center ${className ?? ''}`}>
      <div className="text-center text-text-muted">
        <Film className="mx-auto mb-2" size={32} />
        <p className="text-sm">Video not available</p>
      </div>
    </div>
  );
}

/**
 * Image / carousel surface. Single image renders edge-to-edge. Multiple images
 * (carousel, max 10 per IG/FB) render the active asset full-size with a
 * thumbnail strip pinned to the bottom for navigation, plus a position pill in
 * the corner ("3 / 7"). Aspect class mirrors VideoSurface so the wrapper card
 * geometry stays identical between video and image posts.
 */
function ImageCarouselSurface({
  post,
  className,
  aspectClass = 'aspect-[9/16]',
}: {
  post: Pick<SharedPost, 'assets' | 'cover_image_url'>;
  className?: string;
  aspectClass?: string;
}) {
  const assets = (post.assets ?? []).filter((a) => !!a.url);
  const [activeIdx, setActiveIdx] = useState(0);

  if (assets.length === 0) {
    const fallback = post.cover_image_url;
    if (fallback) {
      return (
        <div className={`relative ${aspectClass} w-full overflow-hidden bg-black ${className ?? ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(fallback, 1080) ?? fallback} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div className={`flex ${aspectClass} w-full items-center justify-center ${className ?? ''}`}>
        <div className="text-center text-text-muted">
          <Film className="mx-auto mb-2" size={32} />
          <p className="text-sm">Image not available</p>
        </div>
      </div>
    );
  }

  const idx = Math.min(activeIdx, assets.length - 1);
  const active = assets[idx];
  const isCarousel = assets.length > 1;

  return (
    <div className={`relative ${aspectClass} w-full overflow-hidden bg-black ${className ?? ''}`}>
      {active.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={active.id}
          src={thumbUrl(active.url, 1080) ?? active.url}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      )}
      {isCarousel && (
        <>
          <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md ring-1 ring-white/15">
            {idx + 1} / {assets.length}
          </div>
          <button
            type="button"
            onClick={() => setActiveIdx((i) => (i - 1 + assets.length) % assets.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-black/65"
            aria-label="Previous image"
          >
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveIdx((i) => (i + 1) % assets.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-black/65"
            aria-label="Next image"
          >
            <span aria-hidden>›</span>
          </button>
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            {assets.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                aria-label={`Show image ${i + 1}`}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === idx ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Branches on post.media_type. Image posts skip the Mux/<video> machinery
 * entirely and fall through to ImageCarouselSurface; video posts keep the
 * existing VideoSurface (which handles Mux + legacy + processing overlay).
 */
function MediaSurface({
  post,
  className,
  aspectClass,
  aspectRatioStyle,
  autoPlay,
  onPlayerReady,
}: {
  post: SharedPost;
  className?: string;
  aspectClass?: string;
  aspectRatioStyle?: string;
  autoPlay?: boolean | 'muted' | 'any';
  onPlayerReady?: (handle: PlayerHandle | null) => void;
}) {
  if (post.media_type === 'image') {
    // Image posts have no player, clear any previously-set handle so the
    // composer's pin chip disappears for image-only cards.
    if (onPlayerReady) onPlayerReady(null);
    return <ImageCarouselSurface post={post} className={className} aspectClass={aspectClass} />;
  }
  return (
    <VideoSurface
      post={post}
      className={className}
      aspectClass={aspectClass}
      aspectRatioStyle={aspectRatioStyle}
      autoPlay={autoPlay}
      onPlayerReady={onPlayerReady}
    />
  );
}

function PostDetailModal({
  post,
  index,
  projectType,
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
  onAssetReplaced,
  onCoverUpdated,
  onRemoveFromCalendar,
  onTitleUpdated,
  onClose,
  requireName,
}: {
  post: SharedPost | null;
  index: number;
  projectType: ShareProjectType;
  isEditor: boolean;
  defaultPostTime: string;
  token: string;
  authorName: string;
  onCommentAdded: (postId: string, c: SharedComment) => void;
  onCommentRemoved: (postId: string, commentId: string) => void;
  onCommentUpdated: (postId: string, c: SharedComment) => void;
  onCaptionUpdated: (postId: string, caption: string, hashtags: string[], c: SharedComment) => void;
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
  onAssetReplaced: (postId: string, next: { url: string; mime_type: string | null }) => void;
  onCoverUpdated: (postId: string, nextCover: string | null, c: SharedComment | null) => void;
  onRemoveFromCalendar: (postId: string) => void;
  onTitleUpdated: (postId: string, title: string | null) => void;
  onClose: () => void;
  requireName: () => void;
}) {
  if (!post) return null;
  return (
    <Dialog open={!!post} onClose={onClose} title="" maxWidth="7xl" bodyClassName="p-0" className="max-h-[92vh]">
      <PostCard
        index={index}
        post={post}
        projectType={projectType}
        isEditor={isEditor}
        defaultPostTime={defaultPostTime}
        token={token}
        authorName={authorName}
        onCommentAdded={(c) => onCommentAdded(post.id, c)}
        onCommentRemoved={(commentId) => onCommentRemoved(post.id, commentId)}
        onCommentUpdated={(c) => onCommentUpdated(post.id, c)}
        onCaptionUpdated={(caption, hashtags, c) =>
          onCaptionUpdated(post.id, caption, hashtags, c)
        }
        onHandlesUpdated={(field, next, c) => onHandlesUpdated(post.id, field, next, c)}
        onScheduleUpdated={(at, c) => onScheduleUpdated(post.id, at, c)}
        onRevisionUploaded={(rev) => onRevisionUploaded(post.id, rev)}
        onAssetReplaced={(next) => onAssetReplaced(post.id, next)}
        onCoverUpdated={(nextCover, c) => onCoverUpdated(post.id, nextCover, c)}
        onRemoveFromCalendar={() => {
          onRemoveFromCalendar(post.id);
          onClose();
        }}
        onTitleUpdated={(title) => onTitleUpdated(post.id, title)}
        requireName={requireName}
        layoutMode="modal"
      />
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
  // Lifted drag state, the cell renders a different border treatment when
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
      toast.error('Already published, date is locked');
      return;
    }
    // Preserve the post's original time-of-day on the new date, falling back
    // to the drop's default_post_time when the post was previously
    // unscheduled (which can't actually drag from the calendar today, but
    // we keep the branch for future drag-from-list-into-calendar flows).
    const scheduledAt = buildScheduledAtForDate(target, post.scheduled_at, defaultPostTime);
    const targetIso = scheduledAt;
    setMoving(true);
    // Optimistic local update, the parent's setData runs through
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
      <h2 className="mb-3 px-1 text-base font-semibold text-text-primary sm:mb-4 sm:px-0 sm:text-lg">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium uppercase tracking-wide text-text-muted sm:gap-1 sm:text-[13px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2">{d}</div>
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
                // started from, pointless and would still log a comment.
                const post = postsById[postId];
                if (post?.scheduled_at && isSameDay(new Date(post.scheduled_at), cell.date)) return;
                void movePostToDate(postId, cell.date);
              }}
            />
          );
        })}
      </div>
      {/* Subtle hint so first-time users discover the affordance, only
          renders when there's at least one schedulable post and an admin
          isn't already dragging. */}
      <p className="mt-3 px-1 text-[13px] text-text-muted sm:px-0 sm:text-sm">
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
          {(() => {
            const firstAssetUrl =
              post.media_type === 'image'
                ? post.assets.find((a) => !!a.url)?.url ?? null
                : null;
            const posterSrc = firstAssetUrl ?? post.cover_image_url;
            if (!posterSrc) {
              return (
                <div className="flex h-full w-full items-center justify-center">
                  <Film size={18} className="text-text-muted" />
                </div>
              );
            }
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl(posterSrc, 80) ?? ''}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            );
          })()}
          {post.media_type !== 'image' && post.video_url && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 shadow ring-1 ring-white/20 backdrop-blur-sm">
                <Play size={11} className="ml-px text-white" fill="white" />
              </div>
            </div>
          )}
          {post.media_type === 'image' && post.assets.length > 1 && (
            <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white ring-1 ring-white/15">
              {post.assets.length}
            </span>
          )}
          {review === 'approved' && (
            <span className="absolute right-1 top-1 rounded-full bg-status-success p-0.5">
              <CheckCircle size={10} className="text-accent-contrast" />
            </span>
          )}
          {review === 'revising' && (
            <span className="absolute right-1 top-1 rounded-full bg-status-warning p-0.5">
              <AlertTriangle size={10} className="text-accent-contrast" />
            </span>
          )}
          {/* Day number overlays the thumbnail in a translucent black chip so
              it stays legible against any cover image. */}
          <span
            className={`absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[13px] font-semibold sm:text-sm ${
              isToday
                ? 'bg-accent text-accent-contrast'
                : 'bg-black/55 text-white backdrop-blur-sm'
            }`}
          >
            {cell.date.getDate()}
          </span>
          {cell.posts.length > 1 && (
            <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm sm:text-xs">
              +{cell.posts.length - 1}
            </span>
          )}
        </button>
      ) : (
        // Empty cell, day number top-left in muted color. Drop target still
        // active because the parent <div> handles dragover/drop.
        <span
          className={`absolute left-1.5 top-1.5 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[13px] sm:text-sm ${
            isToday
              ? 'bg-accent font-semibold text-accent-contrast'
              : cell.inMonth
                ? 'font-medium text-text-secondary'
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
  projectType,
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
  onAssetReplaced,
  onCoverUpdated,
  onRemoveFromCalendar,
  onTitleUpdated,
  requireName,
  layoutMode = 'inline',
}: {
  index: number;
  post: SharedPost;
  projectType: ShareProjectType;
  isEditor: boolean;
  defaultPostTime: string;
  token: string;
  authorName: string;
  onCommentAdded: (c: SharedComment) => void;
  onCommentRemoved: (commentId: string) => void;
  onCommentUpdated: (c: SharedComment) => void;
  onCaptionUpdated: (caption: string, hashtags: string[], c: SharedComment) => void;
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
  /**
   * Image-replace callback. Fires after the server endpoint repoints the
   * `content_drop_post_assets` row at the new bytes, gives the parent the
   * new url/mime so the asset re-renders without a full refetch. Single-asset
   * image posts only (carousels reject server-side).
   */
  onAssetReplaced: (next: { url: string; mime_type: string | null }) => void;
  /**
   * Cover-photo set/clear callback. Video posts only, image posts have no
   * separate cover. `nextCover` is the new URL (POST) or null (DELETE).
   * The activity-rail comment row is `null` if the server's best-effort
   * activity insert failed; the cover update itself is still authoritative
   * because the API already wrote `scheduled_posts.cover_image_url`.
   */
  onCoverUpdated: (nextCover: string | null, c: SharedComment | null) => void;
  onRemoveFromCalendar: () => void;
  onTitleUpdated: (title: string | null) => void;
  requireName: () => void;
  /**
   * `inline` (default, list view): video stacked on top, captionBlock + history + composer below.
   * `modal`: 2-column horizontal layout, video pinned left, scrollable body right. The post-detail
   *   dialog uses this so the video stays in view while the comments column scrolls independently.
   */
  layoutMode?: 'inline' | 'modal';
}) {
  // Project-type-driven layout decisions. Calendar keeps the 9:16 +
  // caption + tag/collab + schedule flow. Editing swaps the caption
  // block for an editable title and drops the schedule/handles surfaces
  // (deliverables don't auto-schedule). Aspect ratio defaults to 9:16
  // for both since the unified Upload Content modal feeds whatever the
  // user actually shot.
  const isCalendar = projectType === 'calendar';
  const isImagePost = post.media_type === 'image';
  const showCaptionFlow = isCalendar;
  const showHandles = isCalendar;
  const showSchedule = isCalendar;
  const displayTitle =
    (post.title && post.title.trim()) ||
    (post.filename_fallback && post.filename_fallback.trim()) ||
    'Untitled creative';
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingApproval, setRemovingApproval] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Hashtags live in their own DB column for the publisher pipeline, but
  // reviewers think of them as part of the caption (because that's how they
  // read on TikTok / IG). Present a single merged blob in the UI and let
  // the API split it back out on save (see lib/scheduler/caption-hashtags).
  const mergedCaption = mergeCaptionAndHashtags({
    caption: post.caption,
    hashtags: post.hashtags,
  });
  const [editingCaption, setEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(mergedCaption);
  const [savingCaption, setSavingCaption] = useState(false);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  // 0, 100 once we start the actual PUT to Mux. Lets the button render
  // "Uploading… 42%" instead of a static spinner, important now that we
  // bypass Vercel and the request can run for many minutes on a big file.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const revisionInputRef = useRef<HTMLInputElement>(null);
  // Cover-photo upload state. Separate hidden input + ref from revisionInputRef
  // so the accept filter ("image/*") and progress copy stay independent of the
  // Replace-video / Replace-image upload that lives on the same card. Video
  // posts only, the button is hidden for image posts (their visible asset is
  // already the cover).
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [clearingCover, setClearingCover] = useState(false);
  // Per-post Download state. The bulk "Download all" lives at the page
  // header for grabbing every asset in one zip; this overlay button is for
  // pulling a single post (e.g. when the reviewer just wants this one
  // image to repost or this one cut to QA). Carousels zip in-browser so
  // the four images come down as one tidy bundle.
  const [downloadingPost, setDownloadingPost] = useState(false);
  // Player + timestamped-comment plumbing. The ref is set when VideoSurface
  // mounts a player (only in the inline `withVideoHeader` mode); when it's
  // null, we hide the anchor button and timestamp pills are non-interactive.
  const playerHandleRef = useRef<PlayerHandle | null>(null);
  const videoSectionRef = useRef<HTMLDivElement | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  // Live playhead, ticks once per second while the player is mounted so the
  // pin chip shows the same time the user sees on the player. The actual
  // value sent on submit is read fresh from the player handle (no rounding
  // drift from the displayed-vs-real time).
  const [livePlayheadSeconds, setLivePlayheadSeconds] = useState(0);
  // Whether the reviewer wants the next comment pinned to the playhead. On
  // by default, the chip is visible from the moment the player is ready,
  // and dismissing it (×) hides it for the current draft. Reset on submit.
  const [pinEnabled, setPinEnabled] = useState(true);
  // Composer is collapsed by default, only Approve / Request change live at
  // the bottom of the card. Clicking Request change expands the textarea so
  // the reviewer can write their note + hit Send. Keeps the resting state of
  // the card calm (most posts get one decision, not a long thread) and
  // matches the "talk only when you need to" Frame.io feel.
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [markAsRevision, setMarkAsRevision] = useState(false);
  // Editor-only "remove from calendar" confirmation. We don't auto-fire the
  // delete on click, destructive enough to warrant a one-step "are you
  // sure?" so an accidental click can't pull a post the editor wanted to
  // keep. The action is reversible (the underlying scheduled_post + drop
  // video stay intact), but reversing it requires admin UI, so we slow
  // things down here.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function confirmRemoveFromCalendar() {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/revision/${post.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to remove');
      }
      toast.success('Removed from calendar');
      setRemoveOpen(false);
      // Optimistic, the parent strips this card from the list, so the
      // dialog unmounts naturally with the card.
      onRemoveFromCalendar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
      setRemoving(false);
    }
  }

  // Tick the displayed playhead once per second while the player is ready.
  // Light touch, we just read the cached time from the handle; no event
  // wiring on the underlying <mux-player> needed.
  useEffect(() => {
    if (!playerReady) return;
    const tick = () => {
      const t = playerHandleRef.current?.getCurrentTime() ?? 0;
      setLivePlayheadSeconds(Math.max(0, Math.floor(t)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [playerReady]);

  // Read the current playhead at the moment a comment is submitted. This is
  // the value the user *meant*, wherever the timeline was when they hit
  // Approve / Request change, not the snapshot from when they first
  // focused the textarea.
  function readCurrentAnchorSeconds(): number | null {
    if (!pinEnabled || !playerReady) return null;
    const t = playerHandleRef.current?.getCurrentTime() ?? 0;
    return Math.max(0, Math.floor(t));
  }

  function seekTo(seconds: number) {
    const handle = playerHandleRef.current;
    if (!handle) return;
    handle.seek(seconds);
    // Bring the player into view if the user scrolled past it inside the
    // modal, the comment they clicked is below the fold most of the time.
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
    if (next === mergedCaption.trim()) {
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
      onCaptionUpdated(
        json.caption as string,
        (json.hashtags as string[] | undefined) ?? [],
        json.comment as SharedComment,
      );
      setEditingCaption(false);
      toast.success('Caption updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save caption');
    } finally {
      setSavingCaption(false);
    }
  }

  async function submit(status: SharedCommentStatus) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (status === 'comment' && !commentText.trim() && pendingAttachments.length === 0) {
      toast.error('Please enter a comment or attach a file');
      return;
    }

    // Optimistic flow: paint a temp comment into the parent immediately so
    // the approval chip flips state without waiting on the round trip. On
    // success we swap the temp row for the real one; on failure we yank the
    // temp row and surface the error.
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
      review_link_id: '',
      author_name: trimmedAuthor,
      // Server resolves the real role from the session; optimistic row
      // stays 'guest' so the chip doesn't pre-promote. RoleChip renders
      // nothing for guest, so the only flicker is the chip popping in
      // once the real row replaces the temp on success.
      author_role: 'guest',
      content: resolvedContent,
      status,
      created_at: new Date().toISOString(),
      attachments: snapshotAttachments,
      caption_before: null,
      caption_after: null,
      metadata: {},
      timestamp_seconds: anchorSeconds,
      parent_comment_id: null,
    };

    onCommentAdded(tempComment);
    // Reset composer immediately, the user already committed to the action,
    // and seeing the temp chip while the field is still full feels laggy.
    setCommentText('');
    setPendingAttachments([]);
    setPinEnabled(true);
    setComposerExpanded(false);
    setMarkAsRevision(false);
    const optimisticToastId = toast.success(
      status === 'approved' ? 'Post approved' : 'Comment added',
    );

    setSubmitting(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          authorName: trimmedAuthor,
          content: resolvedContent,
          status,
          attachments: snapshotAttachments,
          timestampSeconds: anchorSeconds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to submit');
      const savedComment = json.comment as SharedComment;
      // Swap the temp row for the real one. Two-step (remove → add) so the
      // identity-by-id helpers stay simple, no need for an `upsertComment`.
      onCommentRemoved(tempId);
      onCommentAdded(savedComment);
    } catch (err) {
      // Roll back: pull the temp row, dismiss the optimistic toast, and
      // surface the real error so the user can retry.
      onCommentRemoved(tempId);
      toast.dismiss(optimisticToastId);
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
      // Restore composer state so the user doesn't lose their note. Pin
      // stays enabled (the default) since we already reset it on optimistic
      // submit; that matches the "fresh draft" intent if they retry.
      setCommentText(resolvedContent === 'Approved' ? '' : resolvedContent);
      setPendingAttachments(snapshotAttachments);
      if (status === 'comment') setComposerExpanded(true);
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
      toast.error('Already published, date is locked');
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
        // No playback URL yet, Mux is processing. The UI will show a
        // "Processing…" state until the share endpoint reflects the
        // playback id (next mount or refresh).
        revised_video_url: null,
        revised_video_uploaded_at: finJson.uploaded_at as string,
        revised_video_notify_pending: true,
        mux_status: 'processing',
      });
      toast.success('Upload complete, Mux is processing the cut');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingRevision(false);
      setUploadProgress(null);
      if (revisionInputRef.current) revisionInputRef.current.value = '';
    }
  }

  // Image-replace twin of uploadRevisionFile. Posts the new bytes to the
  // image-only endpoint, which uploads to scheduler-media, repoints
  // content_drop_post_assets, and busts the feed-normalized cache. On
  // success we hand the new url back to the parent so the next render
  // shows the swapped image without a full refetch. Carousels are
  // rejected server-side; the UI hides Replace for them already.
  async function uploadReplacementImage(file: File) {
    if (!isEditor) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    setUploadingRevision(true);
    setUploadProgress(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `/api/calendar/share/${token}/replace-image/${post.id}`,
        { method: 'POST', body: fd },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Upload failed (${res.status})`,
        );
      }
      const url = typeof json?.url === 'string' ? json.url : null;
      if (!url) throw new Error('Server did not return the new image URL');
      onAssetReplaced({
        url,
        mime_type: typeof json?.mime_type === 'string' ? json.mime_type : file.type || null,
      });
      toast.success('Image replaced');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingRevision(false);
      setUploadProgress(null);
      if (revisionInputRef.current) revisionInputRef.current.value = '';
    }
  }

  // Cover-photo upload. Video posts only. Posts multipart to the new
  // cover route, which writes scheduled_posts.cover_image_url + an
  // activity entry. We surface the returned comment to the parent so the
  // history rail re-renders without a refetch. Author name is required
  // (mirrors caption / replace-image flows) so the rail can attribute
  // the change.
  async function uploadCoverFile(file: File) {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image (jpg, png, or webp)');
      return;
    }
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('authorName', authorName.trim());
      const res = await fetch(
        `/api/calendar/share/${token}/cover/${post.id}`,
        { method: 'POST', body: fd },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Upload failed (${res.status})`,
        );
      }
      const nextCover = typeof json?.cover_image_url === 'string' ? json.cover_image_url : null;
      if (!nextCover) throw new Error('Server did not return the new cover URL');
      onCoverUpdated(nextCover, (json?.comment as SharedComment | null) ?? null);
      toast.success('Cover photo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cover upload failed');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  }

  // Cover-photo clear. The DELETE route requires the author name as a
  // query string (the body is empty per HTTP semantics) so the activity
  // rail still gets attribution. On success Zernio falls back to the
  // auto-first-frame thumbnail at publish time.
  async function clearCover() {
    if (!authorName.trim()) {
      requireName();
      return;
    }
    if (!post.cover_image_url) return;
    setClearingCover(true);
    try {
      const res = await fetch(
        `/api/calendar/share/${token}/cover/${post.id}?authorName=${encodeURIComponent(authorName.trim())}`,
        { method: 'DELETE' },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Reset failed (${res.status})`,
        );
      }
      onCoverUpdated(null, (json?.comment as SharedComment | null) ?? null);
      toast.success('Cover photo reset');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setClearingCover(false);
    }
  }

  // Per-post download. Reuses the same target builder the bulk zip uses so
  // the filenames stay consistent: a video post yields one mp4 named after
  // the post; a single-image post yields one image; a carousel yields a
  // small zip with one entry per asset (numbered -1, -2…).
  async function handlePostDownload() {
    if (downloadingPost) return;
    const targets = buildPostDownloadTargets(post, 0);
    if (targets.length === 0) {
      toast.error('Nothing to download yet.');
      return;
    }
    setDownloadingPost(true);
    try {
      if (targets.length === 1) {
        const t = targets[0];
        const res = await fetch(t.url);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = t.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 1000);
      } else {
        // Carousel: zip in-browser so the user gets one file instead of N
        // anchor-click downloads (which the popup blocker chokes on).
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const used = new Set<string>();
        let added = 0;
        await Promise.all(
          targets.map(async (t) => {
            try {
              const res = await fetch(t.url);
              if (!res.ok) return;
              const name = uniqueZipName(used, t.filename);
              zip.file(name, await res.blob());
              added += 1;
            } catch {
              // skip individual asset failures
            }
          }),
        );
        if (added === 0) {
          toast.error('Could not download any files. Try again.');
          return;
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = `${postLabel(post, 0)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 1000);
      }
    } catch (err) {
      console.error('[handlePostDownload] failed', err);
      toast.error('Download failed.');
    } finally {
      setDownloadingPost(false);
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
        {showSchedule && (
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
        )}
        {review === 'approved' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/12 px-3 py-1.5 text-sm font-medium text-status-success ring-1 ring-status-success/30">
            <CheckCircle size={13} /> Approved
          </span>
        )}
        {review === 'revising' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning/12 px-3 py-1.5 text-sm font-medium text-status-warning ring-1 ring-status-warning/30">
            <AlertTriangle size={13} /> Revision requested
          </span>
        )}
        {review === null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm font-medium text-text-muted">
            <MessageSquare size={13} /> Awaiting review
          </span>
        )}
      </div>

      {!showCaptionFlow && (
        <TitleEditor
          token={token}
          postId={post.id}
          title={post.title}
          fallback={post.filename_fallback}
          displayTitle={displayTitle}
          onSaved={onTitleUpdated}
          requireName={() => {
            if (!authorName.trim()) requireName();
          }}
          hasName={!!authorName.trim()}
        />
      )}

      {showCaptionFlow && (isPublished ? (
        // Once a post is in Zernio's hands the caption is locked. Render a
        // read-only, dimmed copy of the caption + a "Published" confirmation
        // card so the reviewer sees what shipped without thinking they can
        // still tweak it.
        <div className="space-y-2">
          <div className="rounded-lg border border-nativz-border/60 bg-surface-hover/40 px-3 py-2.5">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-muted">
              {mergedCaption.trim().length > 0 ? mergedCaption : (
                <span className="italic">No caption</span>
              )}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-status-success/30 bg-status-success/10 px-2.5 py-1 text-xs font-medium text-status-success">
            <CheckCircle size={13} /> Published
          </div>
        </div>
      ) : editingCaption ? (
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
                setDraftCaption(mergedCaption);
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
            {mergedCaption.trim().length > 0 ? mergedCaption : (
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
              setDraftCaption(mergedCaption);
              setEditingCaption(true);
            }}
            data-tour="cal-caption"
            className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-md border border-nativz-border bg-surface px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover"
            title="Edit caption"
          >
            <Pencil size={11} /> Edit
          </button>
        </div>
      ))}

      {showHandles && (
        <div data-tour="cal-collab" className="space-y-2">
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
      )}
    </div>
  );

  // Video panel, both list-view cards and the post-detail modal use the
  // same horizontal layout (video pinned left, scrollable column on the
  // right). The wrapper has no enforced min-height, so the column hugs
  // the video's natural geometry, no letterboxing top/bottom. The Mux
  // player has its own fullscreen control built in, so "make it full
  // size" doesn't need an explicit button here.
  // CSS aspect ratio used by the inner Mux player. Must mirror the Tailwind
  // aspect class on the wrapping div (see videoColAspect below) so the
  // player and its container agree on geometry.
  // Image posts always use 4:5 (Instagram feed max-vertical). Their cropped
  // render is 1080×1350, putting that inside a 9:16 container creates
  // top/bottom pillarbox bars, which is what the customer was seeing.
  // Post-migration 302 both project types default to 9:16; the legacy
  // 16:9 (CTV) and 1:1 (social ad) branches were dropped along with the
  // type dropdown.
  const videoAspectRatioStyle = isImagePost ? '4 / 5' : '9 / 16';
  const videoPanel = (
    <div
      ref={videoSectionRef}
      className="relative h-full w-full"
    >
      <MediaSurface
        post={post}
        className="block h-full w-full"
        aspectClass={isImagePost ? 'aspect-[4/5]' : 'aspect-[9/16]'}
        aspectRatioStyle={videoAspectRatioStyle}
        onPlayerReady={(handle) => {
          playerHandleRef.current = handle;
          setPlayerReady(!!handle);
        }}
      />
    </div>
  );

  // Image vs video Replace share the same hidden input + ref. The accept
  // attribute and the per-file dispatch swap based on the post's media_type
  // so an image post posts to the image endpoint and never tries to mint a
  // Mux upload (and vice versa).
  const revisionInput = isEditor ? (
    <input
      ref={revisionInputRef}
      type="file"
      accept={isImagePost ? 'image/*' : 'video/*'}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (isImagePost) uploadReplacementImage(f);
        else uploadRevisionFile(f);
      }}
    />
  ) : null;

  // Cover-photo hidden input, video posts only, separate from
  // revisionInput so the accept filter stays "image/*" without colliding
  // with the Replace-video flow's "video/*" filter on the same card.
  const coverInput = !isImagePost ? (
    <input
      ref={coverInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        uploadCoverFile(f);
      }}
    />
  ) : null;

  // NAT-73: split the flat comment list into parents + replies so the
  // <CommentRow> can render replies inline under each top-level comment.
  // Replies whose parent is not in this post (shouldn't happen, but defensive
  // against drift between the parent_comment_id FK and the share-link's
  // post_review_link_map) fall back to rendering as their own root row.
  const repliesByParent: Record<string, SharedComment[]> = {};
  const topLevelComments: SharedComment[] = [];
  for (const c of post.comments) {
    if (c.parent_comment_id) {
      (repliesByParent[c.parent_comment_id] ||= []).push(c);
    } else {
      topLevelComments.push(c);
    }
  }
  // Catch orphans (parent_comment_id set but parent missing from this post).
  // We hoist them back to the top level so the row still renders rather than
  // disappearing into the structured void.
  const topLevelIds = new Set(topLevelComments.map((c) => c.id));
  for (const c of post.comments) {
    if (c.parent_comment_id && !topLevelIds.has(c.parent_comment_id)) {
      topLevelComments.push(c);
    }
  }
  // Preserve created_at ordering (the server already orders ascending) when
  // we re-merge orphans.
  topLevelComments.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const historyBlock =
    post.comments.length > 0 ? (
      // mt-2 puts a small breathing room between the caption and the
      // history list so the two sections don't read as one solid block.
      // The internal border-t still does the visual divider work; the
      // margin is purely to give the eye somewhere to rest.
      <div className="mt-2 border-t border-nativz-border bg-background/40 px-3 py-4 sm:px-4">
        {/* Section heading uses the same uppercase-eyebrow treatment as
            other admin sub-sections so History reads as metadata rather
            than competing with the caption above. Count gives instant
            sense of how much there is to scroll. */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            History
          </h3>
          <span className="text-[10px] font-medium text-text-muted/70">
            {post.comments.length}
          </span>
        </div>
        {/* Cap the comment list height + scroll inside. Without this the
            card grows unbounded as history accrues, especially for image
            posts where the card sizes to content. With it: the History
            header stays pinned, the composer stays in reach, and a long
            review thread scrolls inside its own region. */}
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {topLevelComments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              replies={repliesByParent[c.id] ?? []}
              postId={post.id}
              token={token}
              isEditor={isEditor}
              authorName={authorName}
              requireName={requireName}
              onDeleted={() => onCommentRemoved(c.id)}
              onUpdated={onCommentUpdated}
              onReplyAdded={onCommentAdded}
              onReplyRemoved={onCommentRemoved}
              onSeek={playerReady ? seekTo : undefined}
            />
          ))}
        </div>
      </div>
    ) : null;

  const composerBlock = (
    <div className="border-t border-nativz-border bg-surface px-3 py-3 sm:px-4">
      {/* Expanded composer, only renders when the reviewer is actively
          drafting a "Request change" note. Default rest state hides this
          entirely so the column doesn't read as a wall of inputs the user
          must engage with before they can approve. */}
      {composerExpanded && (
        <div className="mb-3 rounded-lg border border-nativz-border bg-background/60 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/40">
          <textarea
            ref={(el) => {
              // Auto-focus on first expand so the cursor is already in place
              // when the user opens the composer, no extra click required.
              if (el && composerExpanded && document.activeElement !== el && !commentText) {
                el.focus();
              }
            }}
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

          {/* Action row inside the textbox, Attach + timestamp on the
              left, Send on the right. Mirrors the "compose pane bottom
              bar" pattern in Slack/Linear so reviewers don't have to hunt
              for the submit affordance. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-nativz-border/60 px-2 py-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || uploading || pendingAttachments.length >= 10}
              className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              {uploading ? 'Uploading…' : 'Attach files'}
            </button>
            {/* Live timestamp chip, tracks the current playhead so the
                pinned moment matches whatever the user is looking at when
                they hit Send. Dismiss (×) opts out for the current draft;
                the fallback button lets them opt back in. */}
            {playerReady && (
              pinEnabled ? (
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
              )
            )}
            <div className="ml-auto flex items-center gap-1">
              {/* Revision toggle. Visual-only toggle, all comments submit as 'comment'. */}
              <button
                type="button"
                onClick={() => setMarkAsRevision((v) => !v)}
                disabled={submitting || uploading}
                aria-pressed={markAsRevision}
                title={markAsRevision ? 'Sending as revision request' : 'Send as feedback only'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
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
                onClick={() => {
                  setComposerExpanded(false);
                  setCommentText('');
                  setPendingAttachments([]);
                  setMarkAsRevision(false);
                }}
                disabled={submitting || uploading}
                className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-text-muted transition-all hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit('comment')}
                disabled={submitting || uploading || (!commentText.trim() && pendingAttachments.length === 0)}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-accent"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviewer decisions, anchored to the bottom of the column so the
          two primary actions (Approve, Request change) are always at the
          same hand-position regardless of comment thread length. The
          editor-only Remove is split off behind ml-auto on sm+ and
          rendered icon-only so it never visually competes with Approve. */}
      <div className="flex flex-wrap items-center gap-2">
        {review === 'approved' && latestApprovedId ? (
          <button
            type="button"
            onClick={removeApproval}
            disabled={removingApproval || submitting || uploading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:flex-none sm:py-2"
          >
            {removingApproval ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
            Remove approval
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit('approved')}
            disabled={submitting || uploading}
            data-tour="cal-approve"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-status-success px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-all hover:opacity-90 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50 sm:flex-none sm:py-2"
          >
            <CheckCircle size={14} /> Approve
          </button>
        )}
        {/* Request change opens the composer rather than submitting
            directly, submission only fires from the Send button inside
            the textbox, after the reviewer has actually written something. */}
        <button
          type="button"
          onClick={() => setComposerExpanded((v) => !v)}
          disabled={submitting || uploading}
          aria-expanded={composerExpanded}
          data-tour="cal-request-change"
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 sm:flex-none sm:py-2 ${
            composerExpanded
              ? 'border-accent/50 bg-accent-surface text-accent-text'
              : 'border-nativz-border bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <MessageSquare size={14} /> Add comment
        </button>
        {/* Secondary cluster, Download (everyone), Replace (editor-only,
            single-asset posts), Remove (editor-only). On sm+ they collapse
            into a right-aligned icon row so they don't visually compete
            with the two primary CTAs; on mobile they expand to full-width
            labelled buttons. Carousels download as a single zip so the
            reviewer doesn't fight the popup blocker on N anchor clicks. */}
        <button
          type="button"
          onClick={() => void handlePostDownload()}
          disabled={downloadingPost || buildPostDownloadTargets(post, 0).length === 0}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:ml-auto sm:h-9 sm:w-9 sm:px-0 sm:py-0"
          title={
            post.media_type === 'image'
              ? post.assets.length > 1
                ? 'Download this carousel as a zip'
                : 'Download this image'
              : 'Download this video'
          }
          aria-label={
            post.media_type === 'image'
              ? post.assets.length > 1
                ? 'Download this carousel as a zip'
                : 'Download this image'
              : 'Download this video'
          }
        >
          {downloadingPost ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          <span className="sm:hidden">{downloadingPost ? 'Downloading…' : 'Download'}</span>
        </button>
        {isEditor && (post.media_type !== 'image' || post.assets.length === 1) && (
          <button
            type="button"
            onClick={() => revisionInputRef.current?.click()}
            disabled={uploadingRevision || submitting || uploading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:h-9 sm:w-9 sm:px-0 sm:py-0"
            title={
              isImagePost
                ? 'Replace this image with a new upload'
                : 'Replace the current cut with a new upload'
            }
            aria-label={
              isImagePost
                ? 'Replace this image with a new upload'
                : 'Replace the current cut with a new upload'
            }
          >
            {uploadingRevision ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            <span className="sm:hidden">
              {uploadingRevision
                ? uploadProgress !== null
                  ? `Uploading ${uploadProgress}%`
                  : 'Uploading…'
                : 'Replace'}
            </span>
          </button>
        )}
        {/* Cover photo: video posts only. Visible to both reviewers and
            editors (per Item 4 of the PRD, covers are a brand-side
            decision, not a strategist-only one). Image posts already use
            their asset as the visible thumbnail, so no cover affordance.
            Hidden from anonymous visitors so the affordance only appears
            after the visitor has identified themselves through the
            gateway, otherwise clicking would just bounce to the name
            prompt and feels like a dead end. */}
        {!isImagePost && (isEditor || authorName.trim() !== '') && (
          <button
            type="button"
            onClick={() => {
              if (!authorName.trim()) {
                requireName();
                return;
              }
              coverInputRef.current?.click();
            }}
            disabled={uploadingCover || clearingCover || submitting || uploading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:h-9 sm:w-9 sm:px-0 sm:py-0"
            title={post.cover_image_url ? 'Replace the cover photo' : 'Choose a cover photo'}
            aria-label={post.cover_image_url ? 'Replace the cover photo' : 'Choose a cover photo'}
          >
            {uploadingCover ? <Loader2 size={13} className="animate-spin" /> : <ImageUp size={13} />}
            <span className="sm:hidden">
              {uploadingCover
                ? 'Uploading…'
                : post.cover_image_url
                  ? 'Edit cover'
                  : 'Set cover'}
            </span>
          </button>
        )}
        {/* Reset cover only when a custom cover has been set. Falls back
            to the auto-first-frame thumbnail Mux + the ingest pipeline
            stamped at upload time. Same identity gate as the edit button
            above. */}
        {!isImagePost && post.cover_image_url && (isEditor || authorName.trim() !== '') && (
          <button
            type="button"
            onClick={() => void clearCover()}
            disabled={uploadingCover || clearingCover || submitting || uploading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 sm:h-9 sm:w-9 sm:px-0 sm:py-0"
            title="Reset to the default cover"
            aria-label="Reset to the default cover"
          >
            {clearingCover ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            <span className="sm:hidden">{clearingCover ? 'Resetting…' : 'Reset cover'}</span>
          </button>
        )}
        {/* Editor-only remove. Icon-only on sm+ to avoid competing with
            the two primary CTAs visually; full-width labelled button
            below them on mobile so the destructive action stays
            discoverable without a tooltip. */}
        {isEditor && (
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            disabled={submitting || uploading || removing}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-transparent bg-transparent px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-status-danger/40 hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-50 sm:h-9 sm:w-9 sm:px-0 sm:py-0"
            title="Remove this post from the calendar"
            aria-label="Remove this post from the calendar"
          >
            {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            <span className="sm:hidden">{removing ? 'Removing…' : 'Remove from calendar'}</span>
          </button>
        )}
      </div>

      {/* Project-standard ConfirmDialog, same shell used by Delete client
          and other destructive flows so the styling reads as native. The
          confirm path closes the dialog before firing so the auto-focused
          button can't fire twice; the parent handles the loading toast. */}
      <ConfirmDialog
        open={removeOpen}
        title="Remove from calendar?"
        description="This post will disappear from the calendar the brand sees. The caption, comments, and underlying video stay safe, you can add it back from the admin calendar if you change your mind."
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        variant="danger"
        onConfirm={() => {
          setRemoveOpen(false);
          void confirmRemoveFromCalendar();
        }}
        onCancel={() => {
          if (!removing) setRemoveOpen(false);
        }}
      />
    </div>
  );

  // Layout: video pinned left at 9:16 (or 4:5 for stills), comments
  // scroll right. Post-migration 302 both project types default to 9:16
  // so the legacy CTV vertical-stack + 1:1 square-ad layouts are gone;
  // feedstock is whatever the user actually uploaded.
  // Image posts get a smaller fixed height than video. The 78vh card was
  // scoped to the video review case (frame.io-style chrome where the
  // comments column scrolls inside a bounded right panel), for a still
  // image at 4:5 the picture only fills ~55vh, so the rest reads as a big
  // empty gap. 60vh hugs the image's natural footprint while still giving
  // the right column a definite height, which is what pins the composer
  // (Approve / Request change) to the bottom of the card. With no fixed
  // height the inner flex-1 has nothing to grow into and the composer
  // floats up next to the caption.
  const heightPx = isImagePost ? 'md:h-[60vh]' : 'md:h-[78vh]';
  const articleChrome =
    layoutMode === 'modal'
      ? `flex flex-col overflow-hidden bg-surface md:flex-row ${heightPx}`
      : `flex flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface md:flex-row ${heightPx}`;
  const videoColAspect = isImagePost ? 'aspect-[4/5]' : 'aspect-[9/16]';
  // Width-pin the media column instead of relying on `md:w-auto` +
  // aspect-ratio. The auto path was resolving to the <mux-player>
  // intrinsic content size in some Chromium builds and collapsing the
  // comments rail. Image posts are 4:5 (letting card height drive width
  // makes the column ~62vh wide and squashes the comments column), so
  // cap to ~44vh so the right column keeps room.
  // Two letterbox fixes layered together. (1) No `bg-black` on the wrapper , 
  // the inner MediaSurface paints its own black behind the player, and an
  // extra wrapper bg was showing as a frame around the player whenever the
  // column geometry didn't perfectly match the player's intrinsic aspect.
  // (2) No `md:h-full` on video, the column hugs its 9:16 aspect-ratio so
  // the player fills it edge-to-edge. With `h-full` the col stretched to
  // the card's fixed 78vh height while the Mux player stayed pinned at
  // its 9:16 aspect, leaving an empty strip under the player. `self-start`
  // keeps the right (comments) column free to take the full card height.
  const videoColSizing = isImagePost
    ? 'w-full md:w-[44vh] md:max-w-[480px] md:flex-shrink-0 md:self-center'
    : 'w-full md:w-[44vh] md:max-w-[440px] md:flex-shrink-0 md:self-start';
  return (
    <article
      id={layoutMode === 'inline' ? `post-${index}` : undefined}
      className={articleChrome}
    >
      {revisionInput}
      {coverInput}
      <div className={`${videoColAspect} ${videoColSizing}`}>
        {videoPanel}
      </div>
      {/* Right (or bottom for CTV) column: title/caption + history scroll
          inside their own region; the composer (Approve / Request change
          + expandable note box) is pinned to the bottom of the card so the
          primary actions are at a consistent hand-position regardless of
          how long the comment thread runs. */}
      <div className="flex flex-1 flex-col md:min-w-0 md:h-full">
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4">{captionBlock}</div>
          {historyBlock}
        </div>
        {composerBlock}
      </div>
    </article>
  );
}

function CommentRow({
  comment,
  replies = [],
  postId,
  token,
  isEditor,
  authorName,
  requireName,
  onDeleted,
  onUpdated,
  onReplyAdded,
  onReplyRemoved,
  onSeek,
  isReply = false,
}: {
  comment: SharedComment;
  // NAT-73: inline replies rendered indented under this row. Only the
  // top-level rendering pass passes a non-empty array; the row itself
  // renders each reply as another `<CommentRow>` with `isReply` set so the
  // recursive call drops the Reply affordance and the further nesting.
  replies?: SharedComment[];
  postId?: string;
  token: string;
  isEditor: boolean;
  authorName?: string;
  // Called when the user clicks Reply without a name set, parent owns the
  // name-capture flow (the existing "Your name" modal) and refocuses the
  // composer once the user submits.
  requireName?: () => void;
  onDeleted: () => void;
  onUpdated: (comment: SharedComment) => void;
  // Append a freshly-posted reply into the parent's comment array. The
  // parent's `appendComment(postId, comment)` already handles the local
  // update; we just hand it the new row.
  onReplyAdded?: (comment: SharedComment) => void;
  onReplyRemoved?: (commentId: string) => void;
  // When provided, the timestamp pill becomes clickable and seeks the
  // shared player. Undefined for list-view rows where there's no inline
  // player to drive (the user opens the lightbox instead).
  onSeek?: (seconds: number) => void;
  // Set on the recursive render of reply rows. Drops the Reply button (one
  // level of nesting only) and tightens the chrome.
  isReply?: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the reply textarea the first frame it mounts. Doing it inside
  // a useEffect (vs. autoFocus) so re-opens after a cancel also refocus.
  useEffect(() => {
    if (replyOpen && replyTextareaRef.current) {
      replyTextareaRef.current.focus();
    }
  }, [replyOpen]);

  // NAT-73: reply submitter. Skips the optimistic-temp dance the main
  // composer does because replies are short, low-stakes, and the failure
  // path is just "show the error toast" - the user can retype in two
  // seconds. Keeps the surface area small.
  async function submitReply() {
    if (sendingReply) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    if (!authorName?.trim()) {
      requireName?.();
      return;
    }
    if (!postId || !onReplyAdded) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          authorName: authorName.trim(),
          content: trimmed,
          status: 'comment',
          attachments: [],
          timestampSeconds: null,
          parentCommentId: comment.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to send reply');
      }
      onReplyAdded(json.comment as SharedComment);
      setReplyText('');
      setReplyOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  }
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  // Auto-approval inference was removed 2026-05-14. Old rows with
  // `metadata.auto_approved` are still rendered as plain approvals; the
  // flag no longer surfaces a separate label.

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

  const resolveButton = null;

  // Single hover-revealed X in the top-right corner of every history row.
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

  const { tone, Icon } = resolveCommentStyle(comment.status);
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
          <RoleChip role={comment.author_role} />
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
          <RoleChip role={comment.author_role} />
          <span className="text-text-muted">{comment.content || activityVerb(comment.status)} · {time}</span>
          {headerDeleteButton}
        </div>
      </div>
    );
  }

  if (comment.status === 'cover_edit') {
    // Cover edit row, shows the before/after thumbnails inline so the
    // rail reads as a true diff (matches the caption_edit "before / now"
    // pattern). `caption_before` carries the previous cover URL and
    // `caption_after` carries the new one; either side may be null when
    // the cover was just reset to default.
    const before = comment.caption_before;
    const after = comment.caption_after;
    return (
      <div className="group rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
        <div className="mb-2 flex items-center gap-2 text-[13px]">
          <Icon size={12} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <RoleChip role={comment.author_role} />
          <span className="text-text-muted">
            {after ? 'updated the cover photo' : 'reset the cover photo'} · {time}
          </span>
          {headerDeleteButton}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CoverDiffThumb label="Before" src={before} />
          <span className="text-text-muted" aria-hidden="true">→</span>
          <CoverDiffThumb label={after ? 'After' : 'Default'} src={after} />
        </div>
      </div>
    );
  }

  const containerClass = 'group rounded-lg border border-nativz-border bg-surface px-3 py-2';
  const trailingMeta = '';
  // Timestamp pill, only renders on `comment` rows since approval rows aren't
  // anchored. When an `onSeek` callback is wired (modal view with a live
  // player), the pill is clickable and jumps the playhead; otherwise it's a
  // static label.
  const timestampPill =
    comment.timestamp_seconds !== null &&
    comment.status === 'comment' ? (
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
  // NAT-73: reply gate, only top-level `comment` rows get the affordance.
  // Replies-to-replies are disallowed (one level of nesting).
  const canReply =
    !isReply &&
    comment.status === 'comment' &&
    !!postId &&
    !!onReplyAdded;

  return (
    <>
      <div className={containerClass}>
        <div className="mb-1 flex items-center gap-2 text-[13px]">
          <Icon size={12} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <RoleChip role={comment.author_role} />
          <span className="text-text-muted">· {trailingMeta}{time}</span>
          {timestampPill}
          {headerDeleteButton}
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
        {canReply && !replyOpen && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => {
                if (!authorName?.trim()) {
                  requireName?.();
                  return;
                }
                setReplyOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <MessageSquare size={11} />
              Reply
            </button>
          </div>
        )}
        {canReply && replyOpen && (
          // Inline composer, sits inside the parent row so it visually
          // belongs to the comment it's responding to. Deliberately lighter
          // chrome than the main composer at the bottom of the post (no
          // attachments, no status picker), replies are short follow-ups.
          <div className="mt-2 rounded-md border border-nativz-border bg-background/40 p-2">
            <textarea
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submitReply();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setReplyText('');
                  setReplyOpen(false);
                }
              }}
              placeholder={`Reply to ${comment.author_name}...`}
              rows={2}
              className="w-full resize-none rounded-sm border-0 bg-transparent text-[13px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
            />
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setReplyText('');
                  setReplyOpen(false);
                }}
                disabled={sendingReply}
                className="rounded-md border border-nativz-border bg-transparent px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReply()}
                disabled={sendingReply || !replyText.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sendingReply ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
      {replies.length > 0 && !isReply && (
        // Indented thread under the parent. One level only, these child
        // rows render with `isReply` so they drop their own Reply button.
        <div className="ml-6 mt-2 space-y-2 border-l-2 border-nativz-border/60 pl-3">
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              isReply
              token={token}
              isEditor={isEditor}
              postId={postId}
              authorName={authorName}
              requireName={requireName}
              onDeleted={() => onReplyRemoved?.(r.id)}
              onUpdated={onUpdated}
              onSeek={onSeek}
            />
          ))}
        </div>
      )}
    </>
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
    case 'cover_edit':
      return 'updated the cover photo';
    default:
      return '';
  }
}

/**
 * Inline before/after thumbnail for the cover_edit history row. Null src
 * (e.g. there was no custom cover before, or the cover was just reset)
 * renders a dashed placeholder labeled "Default" so the rail still shows
 * a comparable footprint on both sides.
 */
function CoverDiffThumb({ label, src }: { label: string; src: string | null }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-12 overflow-hidden rounded border border-nativz-border bg-background/40">
        {src ? (
          // Plain img, these are reviewer-uploaded JPEG/PNG/WebPs in
          // scheduler-media. Next/Image would force a remotePatterns
          // entry per share link; not worth the complexity for a 12x16
          // history thumb.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-muted">
            None
          </div>
        )}
      </div>
      <figcaption className="text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</figcaption>
    </figure>
  );
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
        data-tour={isPublished ? undefined : 'cal-schedule'}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
          isPublished
            ? 'bg-surface-hover text-text-muted'
            : 'bg-accent-surface text-accent-text ring-1 ring-accent/40 hover:bg-accent/15 hover:ring-accent'
        }`}
        title={isPublished ? 'Already published, date is locked' : 'Change scheduled date'}
        aria-label={isPublished ? `Scheduled ${scheduledLabel}` : `Scheduled ${scheduledLabel}, tap to change`}
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

/**
 * Editable per-creative title for Social Ads / CTV Ads / Other share links.
 *
 * Click to enter edit mode → type → Enter (or click Save) commits, Esc
 * reverts. Empty input resets the override to NULL so the viewer falls
 * back to the underlying upload's filename. The chip stays unobtrusive
 * (small font, dashed border on hover) so it doesn't compete with the
 * primary "Approve / Request change" actions in the composer below.
 */
function TitleEditor({
  token,
  postId,
  title,
  fallback,
  displayTitle,
  onSaved,
  requireName,
  hasName,
}: {
  token: string;
  postId: string;
  title: string | null;
  fallback: string | null;
  displayTitle: string;
  onSaved: (title: string | null) => void;
  requireName: () => void;
  hasName: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Draft seeds from the saved override or the filename fallback so the
  // editor starts with something useful instead of an empty box.
  const [draft, setDraft] = useState(title ?? fallback ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const next = draft.trim();
    // Treat the filename fallback as the default, if the user "edited" it
    // back to the same value, just exit edit mode without a network call.
    if (next === (title ?? fallback ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, title: next }),
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
          placeholder={fallback ?? 'Creative title'}
          className="flex-1 rounded-md border border-accent/40 bg-background/60 px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
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
      <Type size={14} className="text-text-muted" />
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
        className="flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-base font-medium text-text-primary transition-colors hover:border-nativz-border hover:bg-surface-hover"
        title="Edit title"
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

// One zip entry. We flatten posts up-front so the bundler doesn't have to
// re-derive URLs per asset and so toast counters can use a flat denominator.
interface PostDownloadTarget {
  url: string;
  filename: string;
}

// Picks the best available mp4 URL for a video post:
//   1. Mux capped-1080p (post-process render that's safe for direct download)
//   2. revised_video_url (legacy Supabase Storage URL after a re-cut)
//   3. video_url (original upload, pre-revision)
// Returns null when the post hasn't finished uploading yet (mid-processing
// posts have a Mux upload but no playback id, and no fallback URL).
function getPostVideoDownloadUrl(post: SharedPost): string | null {
  if (post.mux_playback_id) {
    return `https://stream.mux.com/${post.mux_playback_id}/capped-1080p.mp4`;
  }
  if (post.revised_video_url) return post.revised_video_url;
  if (post.video_url) return post.video_url;
  return null;
}

// Build the per-asset download list for a post. Video posts contribute one
// mp4; image posts contribute one entry per asset (so a 4-image carousel
// produces four files in the zip with a `-1`, `-2`… suffix). Skips posts
// that aren't downloadable yet (Mux still processing, no usable asset).
function buildPostDownloadTargets(post: SharedPost, idx: number): PostDownloadTarget[] {
  const baseLabel = postLabel(post, idx);
  if (post.media_type === 'image') {
    const usable = post.assets.filter((a) => a.url);
    const carousel = usable.length > 1;
    return usable.map((a, i) => {
      const ext = mimeToExt(a.mime_type) ?? extFromUrl(a.url ?? '') ?? 'jpg';
      const stem = carousel ? `${baseLabel}-${i + 1}` : baseLabel;
      return {
        url: a.url as string,
        filename: `${stem}.${ext}`,
      };
    });
  }
  const url = getPostVideoDownloadUrl(post);
  if (!url) return [];
  // Mux capped renders are always mp4. For legacy Supabase URLs we sniff
  // the extension off the URL so .mov uploads keep their original ext.
  const ext = post.mux_playback_id ? 'mp4' : (extFromUrl(url) ?? 'mp4');
  return [{ url, filename: `${baseLabel}.${ext}` }];
}

// Human-friendly stem for a single post. Falls back through editor-set
// title → original upload filename → caption snippet → numeric index so
// every entry in the zip has a meaningful name even for un-captioned drafts.
function postLabel(post: SharedPost, idx: number): string {
  const fromTitle = post.title?.trim();
  if (fromTitle) return slugify(fromTitle);
  const fromFallback = post.filename_fallback?.trim();
  if (fromFallback) return slugify(fromFallback);
  const caption = post.caption?.trim();
  if (caption) {
    const snippet = caption.slice(0, 40);
    const slugged = slugify(snippet);
    if (slugged) return slugged;
  }
  return `post-${idx + 1}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function mimeToExt(mime: string | null): string | null {
  if (!mime) return null;
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mime.toLowerCase()] ?? null;
}

function extFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
}

// Pad a zip with `-2`, `-3`… when the same human label collides (e.g. two
// untitled drafts both slug to "post-1"). JSZip silently overwrites
// duplicate keys, which would silently drop files from the zip.
function uniqueZipName(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let i = 2;
  for (;;) {
    const candidate = `${stem}-${i}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    i++;
  }
}

// `<client>-calendar-<startISO>.zip` so a reviewer who downloads multiple
// drops can tell them apart in their Downloads folder. Falls back to a
// generic name when client / dates are missing.
function buildSmmZipFilename(
  clientName: string | null | undefined,
  startDate: string,
  endDate: string,
): string {
  const parts: string[] = [];
  const clientSlug = clientName ? slugify(clientName) : '';
  if (clientSlug) parts.push(clientSlug);
  parts.push('calendar');
  const startSlug = startDate ? startDate.slice(0, 10) : '';
  if (startSlug) {
    parts.push(startSlug);
  }
  if (endDate && endDate.slice(0, 10) !== startSlug) {
    parts.push(endDate.slice(0, 10));
  }
  const stem = parts.filter(Boolean).join('-') || 'calendar-share';
  return `${stem}.zip`;
}

/**
 * "+ Add new video" modal. Editor-only. Three phases:
 *
 *   1. Pick a file → POST /add-post/init → XHR PUT to Mux signed URL →
 *      POST /add-post/[videoId]/finalize.
 *   2. Poll /add-post/[videoId]/status while Mux packages + Whisper +
 *      caption-gen run. Status moves through mux_processing → analyzing →
 *      caption_pending → ready (or failed). Editor sees a chip + a
 *      preview of the auto-caption once it lands.
 *   3. Editor adjusts caption + hashtags, picks a day, hits Schedule →
 *      POST /add-post/[videoId]/schedule, which inserts the draft
 *      scheduled_post + wires it onto the share link. Modal closes and the
 *      parent refetches so the new card pops into the list with a fresh
 *      review composer.
 */
interface AddVideoPlatform {
  id: string;
  platform: 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'googlebusiness';
  username: string | null;
  avatarUrl: string | null;
}

function AddVideoModal({
  open,
  onClose,
  token,
  drop,
  existingScheduledAt,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  drop: { id: string; start_date: string; end_date: string; default_post_time: string };
  existingScheduledAt: string[];
  onDone: () => Promise<void> | void;
}) {
  type Phase = 'pick' | 'uploading' | 'processing' | 'ready' | 'failed' | 'scheduling';
  const [phase, setPhase] = useState<Phase>('pick');
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [thumbUrlState, setThumbUrlState] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [statusValue, setStatusValue] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string>('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<AddVideoPlatform[]>([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(new Set());

  // Reset every time the modal opens fresh.
  useEffect(() => {
    if (!open) return;
    setPhase('pick');
    setProgress(0);
    setVideoId(null);
    setThumbUrlState(null);
    setCaption('');
    setHashtagsText('');
    setStatusValue(null);
    setErrorDetail(null);
    setPickedDay(suggestNextDay(drop, existingScheduledAt));
    setPickedFile(null);
  }, [open, drop, existingScheduledAt]);

  // Fetch connected Zernio profiles once when the modal opens so the
  // platform pills are ready by the time the editor finishes picking a
  // file. Default selection is "all connected", editor unticks anything
  // they don't want this clip going to.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/calendar/share/${token}/add-post/platforms`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && Array.isArray(json?.platforms)) {
          const list = json.platforms as AddVideoPlatform[];
          setPlatforms(list);
          setSelectedPlatformIds(new Set(list.map((p) => p.id)));
        }
      } catch {
        // non-fatal, schedule endpoint will still default to all on submit
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  // Poll status during processing.
  useEffect(() => {
    if (!videoId) return;
    if (phase !== 'processing') return;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/calendar/share/${token}/add-post/${videoId}/status`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json) {
          setStatusValue(json.status ?? null);
          if (json.thumbnailUrl) setThumbUrlState(json.thumbnailUrl);
          if (json.status === 'ready') {
            setCaption(json.draftCaption ?? '');
            const tags = Array.isArray(json.draftHashtags) ? (json.draftHashtags as string[]) : [];
            setHashtagsText(tags.map((t) => `#${t.replace(/^#/, '')}`).join(' '));
            setPhase('ready');
            return;
          }
          if (json.status === 'failed') {
            setErrorDetail(json.errorDetail ?? 'Processing failed');
            setPhase('failed');
            return;
          }
        }
      } catch {
        // transient, keep polling
      }
      timer = window.setTimeout(tick, 3000);
    }

    timer = window.setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [videoId, phase, token]);

  async function handlePick(file: File) {
    if (!file.type.startsWith('video/')) {
      toast.error('Choose a video file');
      return;
    }
    setPickedFile(file);
    setPhase('uploading');
    setProgress(0);
    try {
      const initRes = await fetch(`/api/calendar/share/${token}/add-post/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      const initJson = await initRes.json().catch(() => null);
      if (!initRes.ok || !initJson?.uploadUrl) {
        throw new Error(
          typeof initJson?.error === 'string' ? initJson.error : 'Could not start upload',
        );
      }
      const { uploadUrl, uploadId, videoId: vid } = initJson as {
        uploadUrl: string;
        uploadId: string;
        videoId: string;
      };
      setVideoId(vid);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
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

      const finRes = await fetch(
        `/api/calendar/share/${token}/add-post/${vid}/finalize`,
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
      setPhase('processing');
      setStatusValue('mux_processing');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setErrorDetail(msg);
      setPhase('failed');
      toast.error(msg);
    }
  }

  async function submitSchedule() {
    if (!videoId) return;
    if (!caption.trim()) {
      toast.error('Caption can’t be empty');
      return;
    }
    if (!pickedDay) {
      toast.error('Pick a day');
      return;
    }
    if (platforms.length > 0 && selectedPlatformIds.size === 0) {
      toast.error('Pick at least one platform');
      return;
    }
    const scheduledAt = chicagoNoonUtcLocal(pickedDay);
    const cleanTags = hashtagsText
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);

    setPhase('scheduling');
    try {
      const res = await fetch(
        `/api/calendar/share/${token}/add-post/${videoId}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduledAt,
            caption: caption.trim(),
            hashtags: cleanTags,
            socialProfileIds: Array.from(selectedPlatformIds),
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to schedule');
      }
      toast.success('Post added, the link bounced back to needs approval');
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule');
      setPhase('ready');
    }
  }

  function togglePlatform(id: string) {
    setSelectedPlatformIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isWorking = phase === 'uploading' || phase === 'processing' || phase === 'scheduling';
  const headerSubtitle =
    phase === 'pick'
      ? 'Drop a clip. We’ll transcribe it, write the caption, and queue it on your share link for approval.'
      : phase === 'uploading'
        ? 'Sending bytes to Mux. Don’t close this tab.'
        : phase === 'processing'
          ? 'Mux is packaging the file. AI captioning kicks off the moment a streamable copy lands.'
          : phase === 'ready' || phase === 'scheduling'
            ? 'Review the caption, pick where it goes, and pin it to a day.'
            : 'Something went sideways. Details below.';

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl">
      <div className="space-y-5">
        <header className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-text">
            New post
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
            Add a video to the calendar
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">{headerSubtitle}</p>
        </header>

        {phase === 'pick' && (
          <AddVideoPicker onPick={handlePick} platformCount={platforms.length} />
        )}

        {phase === 'uploading' && (
          <UploadingPanel file={pickedFile} progress={progress} />
        )}

        {phase === 'processing' && (
          <ProcessingPanel
            statusValue={statusValue}
            thumbnailUrl={thumbUrlState}
            filename={pickedFile?.name ?? null}
          />
        )}

        {phase === 'failed' && (
          <div className="space-y-3 rounded-[var(--nz-radius-md)] border border-status-danger/40 bg-status-danger/10 px-4 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-status-danger">
              <AlertCircle size={14} aria-hidden /> Upload couldn’t finish
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              {errorDetail ?? 'Unknown error'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-nativz-border bg-transparent px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'scheduling') && (
          <div className="space-y-5">
            {thumbUrlState && (
              <div className="flex items-center gap-3 rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 p-3">
                <Image
                  src={thumbUrlState}
                  alt=""
                  width={64}
                  height={114}
                  className="rounded-[var(--nz-radius-sm)] object-cover"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {pickedFile?.name ?? 'New video'}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Captioned from the transcript. Edit anything before scheduling.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                  <CheckCircle size={10} /> Ready
                </span>
              </div>
            )}

            <section className="space-y-2">
              <SectionLabel>Caption</SectionLabel>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 px-3 py-2.5 text-sm leading-relaxed text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Caption…"
              />
              <p className="text-[11px] text-text-muted">
                {caption.length}/2200 · written by Cortex from the transcript
              </p>
            </section>

            <section className="space-y-2">
              <SectionLabel>Hashtags</SectionLabel>
              <input
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
                className="w-full rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="#tag1 #tag2"
              />
              <p className="text-[11px] text-text-muted">
                Spaces or commas, # optional.
              </p>
            </section>

            <section className="space-y-2">
              <SectionLabel hint={platforms.length > 0 ? `${selectedPlatformIds.size}/${platforms.length} selected` : undefined}>
                Platforms
              </SectionLabel>
              {platforms.length === 0 ? (
                <div className="rounded-[var(--nz-radius-md)] border border-dashed border-nativz-border bg-background/40 px-3 py-3 text-[11px] text-text-muted">
                  No Zernio profiles connected for this brand yet. Connect them in admin
                  before this can publish.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => {
                    const selected = selectedPlatformIds.has(p.id);
                    const color = PLATFORM_COLOR[p.platform];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-accent/60 bg-accent-surface text-text-primary'
                            : 'border-nativz-border bg-background/40 text-text-muted hover:border-accent/30 hover:text-text-secondary'
                        }`}
                        aria-pressed={selected}
                      >
                        <span
                          className="inline-flex h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="font-medium">
                          {PLATFORM_LABEL[p.platform]}
                        </span>
                        {p.username && (
                          <span className="text-text-muted">@{p.username}</span>
                        )}
                        {selected ? (
                          <CheckCircle size={12} className="text-accent-text" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border border-nativz-border" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <SectionLabel>Post date</SectionLabel>
              <DayChipRow
                value={pickedDay}
                onChange={setPickedDay}
                drop={drop}
                taken={existingScheduledAt}
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={pickedDay}
                  min={todayYyyyMmDd()}
                  onChange={(e) => setPickedDay(e.target.value)}
                  className="rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-[11px] text-text-muted">
                  Posts at {drop.default_post_time?.slice(0, 5) ?? '12:00'} America/Chicago.
                </span>
              </div>
            </section>

            <footer className="flex items-center justify-between gap-3 border-t border-nativz-border pt-4">
              <p className="text-[11px] text-text-muted">
                Lands as a draft on this share link. Goes live only after the client
                approves.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isWorking}
                  className="rounded-full border border-nativz-border bg-transparent px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitSchedule}
                  disabled={
                    isWorking ||
                    !caption.trim() ||
                    !pickedDay ||
                    (platforms.length > 0 && selectedPlatformIds.size === 0)
                  }
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] disabled:opacity-50"
                >
                  {phase === 'scheduling' ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Scheduling…
                    </>
                  ) : (
                    <>
                      <CalendarDays size={12} /> Add to calendar
                    </>
                  )}
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {children}
      </label>
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </div>
  );
}

function UploadingPanel({ file, progress }: { file: File | null; progress: number }) {
  return (
    <div className="space-y-4 rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-surface">
          <Film size={16} className="text-accent-text" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {file?.name ?? 'New video'}
          </p>
          <p className="text-[11px] text-text-muted">
            {file ? `${formatBytes(file.size)} · ` : ''}Uploading to Mux…
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-text-secondary">{progress}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ProcessingPanel({
  statusValue,
  thumbnailUrl,
  filename,
}: {
  statusValue: string | null;
  thumbnailUrl: string | null;
  filename: string | null;
}) {
  // The three Cortex-side steps the editor cares about. Each step is
  // "active" while the corresponding status is the current one, and
  // "done" once we move past it.
  const steps: { key: string; label: string; sub: string; status: 'todo' | 'doing' | 'done' }[] = [
    {
      key: 'mux',
      label: 'Packaging on Mux',
      sub: 'capped 1080p MP4',
      status:
        statusValue === 'analyzing' || statusValue === 'caption_pending' || statusValue === 'ready'
          ? 'done'
          : 'doing',
    },
    {
      key: 'whisper',
      label: 'Transcribing audio',
      sub: 'Whisper',
      status:
        statusValue === 'caption_pending' || statusValue === 'ready'
          ? 'done'
          : statusValue === 'analyzing'
            ? 'doing'
            : 'todo',
    },
    {
      key: 'caption',
      label: 'Writing caption',
      sub: 'Sonnet via OpenRouter, brand voice + saved-caption examples',
      status:
        statusValue === 'ready'
          ? 'done'
          : statusValue === 'caption_pending'
            ? 'doing'
            : 'todo',
    },
  ];

  return (
    <div className="flex gap-4 rounded-[var(--nz-radius-md)] border border-nativz-border bg-background/40 p-4">
      <div className="relative h-32 w-[72px] flex-shrink-0 overflow-hidden rounded-[var(--nz-radius-sm)] bg-nativz-border/40">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film size={18} className="text-text-muted" />
          </div>
        )}
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent via-accent/5 to-transparent" />
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          {filename && (
            <p className="mb-3 truncate text-sm font-medium text-text-primary">{filename}</p>
          )}
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {step.status === 'done' ? (
                    <CheckCircle size={14} className="text-accent-text" />
                  ) : step.status === 'doing' ? (
                    <Loader2 size={12} className="animate-spin text-accent-text" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-nativz-border" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-medium ${
                      step.status === 'todo' ? 'text-text-muted' : 'text-text-primary'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">{step.sub}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[11px] text-text-muted">
          Usually 30 to 90 seconds. Safe to leave this open.
        </p>
      </div>
    </div>
  );
}

function DayChipRow({
  value,
  onChange,
  drop,
  taken,
}: {
  value: string;
  onChange: (next: string) => void;
  drop: { start_date: string; end_date: string };
  taken: string[];
}) {
  const takenSet = useMemo(
    () =>
      new Set(
        taken
          .map((iso) => {
            try {
              return new Date(iso).toISOString().slice(0, 10);
            } catch {
              return '';
            }
          })
          .filter(Boolean),
      ),
    [taken],
  );

  // Show every day in the drop window from "today" forward, capped at 10
  // chips so we don't blow out the modal width on long campaigns. The
  // free-form <input type="date"> below the row covers anything outside.
  const days = useMemo(() => {
    const out: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(drop.start_date);
    const end = new Date(drop.end_date);
    const cursor = new Date(Math.max(start.getTime(), today.getTime()));
    while (cursor <= end && out.length < 10) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [drop.start_date, drop.end_date]);

  if (days.length === 0) return null;

  return (
    <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
      {days.map((ymd) => {
        const date = new Date(`${ymd}T12:00:00Z`);
        const dayLabel = date.toLocaleDateString(undefined, {
          weekday: 'short',
          timeZone: 'UTC',
        });
        const dateLabel = date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
        const isSelected = value === ymd;
        const isTaken = takenSet.has(ymd);
        return (
          <button
            key={ymd}
            type="button"
            onClick={() => onChange(ymd)}
            className={`relative flex min-w-[58px] flex-col items-center rounded-[var(--nz-radius-md)] border px-2.5 py-1.5 text-center transition-colors ${
              isSelected
                ? 'border-accent/60 bg-accent-surface text-text-primary'
                : isTaken
                  ? 'border-nativz-border bg-background/40 text-text-muted hover:border-accent/30 hover:text-text-secondary'
                  : 'border-nativz-border bg-background/40 text-text-secondary hover:border-accent/30'
            }`}
            aria-pressed={isSelected}
            title={isTaken ? 'Already has a post on this day' : undefined}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {dayLabel}
            </span>
            <span className="text-xs font-semibold text-current">{dateLabel}</span>
            {isTaken && !isSelected && (
              <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function AddVideoPicker({
  onPick,
  platformCount,
}: {
  onPick: (file: File) => void;
  platformCount: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onPick(file);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-[var(--nz-radius-md)] border border-dashed px-4 py-12 text-center transition-colors ${
        dragOver
          ? 'border-accent/60 bg-accent-surface'
          : 'border-nativz-border bg-background/40 hover:border-accent/40'
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface">
        <Upload size={20} className="text-accent-text" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-primary">Drop a video here</p>
        <p className="text-[11px] text-text-muted">
          MP4, MOV, or HEVC up to ~500MB · vertical short-form looks best
        </p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-surface px-4 py-1.5 text-xs font-semibold text-accent-text transition-colors hover:border-accent/60 hover:bg-accent-surface/80"
      >
        Choose file
      </button>
      {platformCount > 0 && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          {platformCount} {platformCount === 1 ? 'platform' : 'platforms'} ready
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
}

// Per-platform brand dot color. Mirrors components/scheduler/types.ts
// PLATFORM_BORDER_COLOR. Inlined here so the public share page doesn't
// pull in the admin-scheduler bundle just for a constants table.
const PLATFORM_COLOR: Record<AddVideoPlatform['platform'], string> = {
  facebook: '#3b82f6',
  instagram: '#ec4899',
  tiktok: '#22d3ee',
  youtube: '#ef4444',
  linkedin: '#0a66c2',
  googlebusiness: '#10b981',
};

const PLATFORM_LABEL: Record<AddVideoPlatform['platform'], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Default picker target. Pick the earliest day inside the drop window that
// doesn't already have a scheduled post. If every day is taken (or the
// window is in the past), fall back to "tomorrow" so the editor still gets
// a reasonable default they can adjust.
function suggestNextDay(
  drop: { start_date: string; end_date: string },
  existing: string[],
): string {
  const taken = new Set(
    existing
      .map((iso) => {
        try {
          return new Date(iso).toISOString().slice(0, 10);
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(drop.start_date);
  const end = new Date(drop.end_date);
  const cursor = new Date(Math.max(start.getTime(), today.getTime()));
  while (cursor <= end) {
    const ymd = cursor.toISOString().slice(0, 10);
    if (!taken.has(ymd)) return ymd;
    cursor.setDate(cursor.getDate() + 1);
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function todayYyyyMmDd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Returns the UTC ISO string for 12:00 wall-clock America/Chicago on a
// given YYYY-MM-DD. Mirrors lib/calendar/distribute-slots.ts so the +Add
// flow matches the bulk-pipeline scheduling format exactly.
function chicagoNoonUtcLocal(yyyyMmDd: string): string {
  const utcNoon = new Date(`${yyyyMmDd}T12:00:00Z`);
  const chicagoHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(utcNoon),
    10,
  );
  const hoursToAdd = 12 - chicagoHour;
  return new Date(utcNoon.getTime() + hoursToAdd * 60 * 60 * 1000).toISOString();
}

// Map raw fetch / parse errors to copy that makes sense to a non-engineer
// share-link visitor. The share page renders this as the title above the
// "may have expired" subline.
function toFriendlyShareError(raw: string | null): string {
  if (!raw) return 'Link not found';
  const lower = raw.toLowerCase();
  if (lower.includes('not found')) return 'Link not found';
  if (lower.includes('expired')) return 'This link has expired';
  if (lower.includes('revoked')) return 'This link has been revoked';
  if (lower.includes('unexpected end of json') || lower.includes('failed to execute') || lower.includes('empty response')) {
    return 'Link unavailable';
  }
  if (lower.startsWith('link unavailable')) return raw;
  return 'Link unavailable';
}

// Some upstream errors (Vercel HTML pages, 204s, edge-aborted requests)
// return empty or non-JSON bodies. Calling res.json() on those throws
// "Unexpected end of JSON input" and surfaces the raw exception to the
// share-link visitor. Read as text first, parse defensively, return null
// on failure so callers can build a friendly status-code message.
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

