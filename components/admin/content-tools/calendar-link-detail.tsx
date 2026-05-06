'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { toast } from 'sonner';
import {
  CheckCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Mail,
  MessagesSquare,
  Send,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ComboSelect } from '@/components/ui/combo-select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ShareHistoryPanel } from './share-history-panel';
import { EditedVideosBox, UploadRow } from './edited-videos-box';
import {
  ContentDetailDialog,
  type DetailTab,
} from './detail-dialog/dialog-shell';
import { Section, SideField } from './detail-dialog/section';
import { AssigneePicker } from './assignee-picker';
import { formatRelative, formatTimestamp } from './detail-dialog/format';
import {
  ContentKindBadge,
  UnifiedStatusPill,
} from './detail-dialog/unified-status-pill';
import {
  EmailArchiveDialog,
  EMAIL_KIND_LABEL,
  type ArchivedEmail,
} from './detail-dialog/email-archive-dialog';
import { unifiedStatusForShareLink } from '@/lib/content-tools/unified-status';
import {
  EDITING_STATUS_LABEL,
  type EditingProjectStatus,
  type EditingProjectVideo,
} from '@/lib/editing/types';
import {
  enqueueUploads,
  getProjectUploads,
  subscribe as subscribeUploads,
  subscribeToCompletion,
} from '@/lib/editing/upload-store';
import type {
  ReviewLinkRow,
  ReviewLinkStatus,
} from '@/components/scheduler/review-board';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

type SendVariant = 'initial' | 'revised';

interface SendPreview {
  variant: SendVariant;
  default_variant: SendVariant;
  subject: string;
  message: string;
  html: string;
  share_url: string;
  recipients: { email: string; name: string | null }[];
  client_name: string;
  post_count: number;
  start_date: string;
  end_date: string;
  first_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
}

interface ContactRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

/**
 * Module-level cache for brand POC contacts. Keyed by clientId. Brand
 * profile is the source of truth, so the recipients for a given brand
 * almost never change between dialog opens. Without this, every time
 * the admin clicks a row we re-hit /api/calendar/review/contacts and
 * spinner-flash for ~250ms — Jack flagged this as "those should not
 * have to reload every time."
 *
 * Strategy: cache hit shows instantly; we still revalidate in the
 * background so a contact change on the brand profile lands within
 * one dialog open.
 */
const CONTACTS_CACHE = new Map<string, ContactRow[]>();

/**
 * Cache for the editing-project-id bridged to a given share token.
 * Lookups by token because the dialog is keyed on the share row, not
 * the underlying drop. The id is stable for the lifetime of the share
 * link, so a single GET on first dialog open is enough; subsequent
 * opens skip the round-trip.
 */
interface BridgedProject {
  project: { id: string; name: string; status: string } | null;
  videos: EditingProjectVideo[];
}
const EDITING_BRIDGE_CACHE = new Map<string, BridgedProject>();

/**
 * Pipeline-status dropdown options. Mirrors the editing modal's options
 * exactly so admins see the same labels in both places. The empty
 * sentinel (`''`) maps back to NULL, i.e. "compute from share-link
 * state" — useful for clearing an override after the bundle settled.
 */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Auto (from share link)' },
  ...(Object.keys(EDITING_STATUS_LABEL) as EditingProjectStatus[]).map((value) => ({
    value,
    label: EDITING_STATUS_LABEL[value],
  })),
];

/**
 * Detail dialog for a calendar share link (rows with `kind === 'calendar'`
 * in the unified review table). Built on the shared `ContentDetailDialog`
 * chassis so it reads identically to `EditingProjectDetail`.
 *
 * Why a dialog instead of routing to `/c/<token>`:
 * Jack's flow is "I clicked on a brand row to look at the project, not
 * to take the client view." Auto-opening the share page meant always
 * loading the customer-facing surface just to copy a link or check
 * approval state. The dialog surfaces:
 *
 *   - The share URL itself, copyable inline (the primary affordance)
 *   - "Open" to launch `/c/<token>` in a new tab when he actually wants it
 *   - Approval / revising / pending counters at a glance
 *   - Created / expires / abandoned timestamps
 *   - A revoke action for non-expired links
 *
 * Read-only on purpose: rename + project_type editing already happen
 * inline on the table row, so the dialog stays a focused inspector.
 */

export function CalendarLinkDetail({
  link,
  onClose,
  onRevoked,
  onSent,
  onFollowupRecorded,
  onRefreshed,
  onApprovedAll,
  onChanged,
}: {
  link: ReviewLinkRow | null;
  onClose: () => void;
  /** @deprecated Revoke is no longer surfaced; kept for callers that
   *  still pass it without triggering a TS break. */
  onRevoked?: () => void;
  /**
   * Called after the admin clicks "Refresh link" and the backend extends
   * `expires_at` 30 days forward. Parent table can patch the row's
   * expiry inline instead of refetching.
   */
  onRefreshed?: (patch: { expires_at: string }) => void;
  /**
   * Called after a successful send/resend. Parent should re-fetch the
   * row so DATE SENT (`first_sent_at`) and the variant default flip
   * without forcing a full table reload.
   */
  onSent?: (patch: {
    first_sent_at: string;
    last_sent_at: string;
    send_count: number;
  }) => void;
  /**
   * Called when the admin records an out-of-band followup (Slack/text/etc.)
   * via the "Mark followed up" button. Patches the row optimistically so
   * the Last-followup column drops back to green without a refetch.
   */
  onFollowupRecorded?: (patch: {
    last_followup_at: string;
    followup_count: number;
  }) => void;
  /**
   * Called after a successful "Mark all approved" bulk action so the
   * parent table can flip the counts + status pill without a refetch.
   * Status comes back as the optimistic next state ("approved" when
   * everything got through, "revising" when changes_requested rows
   * remain, "ready_for_review" otherwise).
   */
  onApprovedAll?: (patch: {
    approved_count: number;
    changes_count: number;
    pending_count: number;
    status: ReviewLinkStatus;
  }) => void;
  /**
   * Called after a successful field-level edit on the underlying drop
   * (strategist / editor / notes). Parent re-fetches the unified review
   * table so the modal's `link` prop refreshes with the new values. The
   * AssigneePicker chip resolves from its own cache once `currentUserId`
   * updates, so no email/name plumbing is needed here.
   */
  onChanged?: () => void;
}) {
  const open = !!link;
  const [refreshing, setRefreshing] = useState(false);
  // Optimistic override for the displayed expiry after a successful
  // "Refresh link" action. Cleared on dialog open. Lets the inline
  // expiry text update instantly without forcing the parent table to
  // refetch the row.
  const [expiresOverride, setExpiresOverride] = useState<string | null>(null);
  const [refreshedThisSession, setRefreshedThisSession] = useState(false);
  const [markingFollowup, setMarkingFollowup] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [markingAllApproved, setMarkingAllApproved] = useState(false);
  const remainingToApprove =
    (link?.pending_count ?? 0) + (link?.changes_count ?? 0);
  const { confirm: confirmApproveAll, dialog: approveAllDialog } = useConfirm({
    title: 'Mark all as approved?',
    description: link
      ? `Approve every still-pending post (${remainingToApprove} of ${link.post_count}). They'll publish to Zernio just as if the client clicked approve.`
      : '',
    confirmLabel: 'Approve all',
    variant: 'success',
  });
  const { confirm: confirmDeleteVideo, dialog: deleteVideoDialog } = useConfirm({
    title: 'Delete this video?',
    description: 'This cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<DetailTab>('details');
  // Recipients live on the detail panel itself (not just the send preview)
  // so admins see who'll receive the email *before* clicking send. Empty
  // state matters: if a brand has zero contacts the underlying /send route
  // returns 400, which previously surfaced as a silently-failing button.
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Editing-project bridge for the "Edited videos" Section. The share
  // token's underlying drop_id maps to an `editing_projects.drop_id`
  // row (find-or-create on first upload). Lazily-created so we don't
  // spam the editing board with empty rows for every dialog open.
  const [bridge, setBridge] = useState<BridgedProject | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Send preview / dialog state. `null` = closed; setting to a variant
  // pops the modal and kicks off the GET preview fetch.
  const [previewVariant, setPreviewVariant] = useState<SendVariant | null>(null);
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [ccSelf, setCcSelf] = useState(false);
  // Render toggle: edit the source copy, or eyeball the rendered HTML
  // exactly the way the recipient will see it. Defaults to edit so the
  // dialog opens "ready to tweak the subject", not "ready to send".
  const [renderMode, setRenderMode] = useState<'edit' | 'preview'>('edit');

  // Archived email touchpoints. Lazily loaded on dialog open from the
  // `share_link_emails` table — populated by the writer wired into the
  // send/followup/notify-revisions routes. The sub-dialog renders a
  // single archived row's stored HTML body so the modal can replay
  // exactly what the recipient saw.
  const [archivedEmails, setArchivedEmails] = useState<ArchivedEmail[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<ArchivedEmail | null>(null);

  // Local draft for the Notes textarea. Synced from `link.notes` on open
  // so the textarea is editable without round-tripping every keystroke;
  // saves on blur via PATCH /api/calendar/drops/[id].
  const [notes, setNotes] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Local draft for the Status dropdown (content_drops.pipeline_status).
  // NULL means "compute from share-link state" — that's the default for
  // every existing row. Editing here PATCHes the underlying drop and the
  // unified review pill switches to the override on the next data refresh.
  const [pipelineStatus, setPipelineStatus] = useState<EditingProjectStatus | null>(
    null,
  );

  // Reset transient UI state when a new link is opened.
  useEffect(() => {
    if (open) {
      setCopied(false);
      setTab('details');
      setPreviewVariant(null);
      setPreview(null);
      setPreviewError(null);
      setExpiresOverride(null);
      setRefreshedThisSession(false);
    }
  }, [open, link?.id]);

  // Sync the Notes textarea draft from the underlying link row whenever
  // a different drop is opened OR the parent re-fetches and pushes a
  // fresh `link` prop in. Tracking `link?.notes` (not just id) means a
  // background refresh from `onChanged` (e.g. after the AssigneePicker
  // saves and we reload the list) also pulls in any concurrent notes
  // update from another tab.
  useEffect(() => {
    setNotes(link?.notes ?? '');
  }, [link?.id, link?.notes]);

  // Same pattern for the Status dropdown — tracks `link.pipeline_status`
  // so a save in another tab + parent refresh still flows through.
  useEffect(() => {
    setPipelineStatus((link?.pipeline_status as EditingProjectStatus | null) ?? null);
  }, [link?.id, link?.pipeline_status]);

  // Fetch the brand's POC contacts so the Recipients section shows who
  // will receive the email. Brand profile is the single source of truth.
  const clientId = link?.client_id ?? null;
  useEffect(() => {
    if (!open || !clientId) {
      setContacts(null);
      return;
    }
    const cached = CONTACTS_CACHE.get(clientId) ?? null;
    setContacts(cached);
    let cancelled = false;
    void (async () => {
      // Only show the spinner on a true cache miss. With a hit the
      // list renders instantly and we silently revalidate underneath.
      if (cached === null) setContactsLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('failed');
        const data = (await res.json()) as { contacts: ContactRow[] };
        if (cancelled) return;
        const next = data.contacts ?? [];
        CONTACTS_CACHE.set(clientId, next);
        setContacts(next);
      } catch {
        if (!cancelled && cached === null) setContacts([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const token = link?.token ?? null;

  const loadBridge = useCallback(async () => {
    if (!token) return;
    const cached = EDITING_BRIDGE_CACHE.get(token) ?? null;
    setBridge(cached);
    if (cached === null) setBridgeLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/share/${token}/editing-project`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as BridgedProject;
      EDITING_BRIDGE_CACHE.set(token, data);
      setBridge(data);
    } catch {
      // Stay on the cached payload (or null) on failure; the empty
      // drop-zone state still works for upload-first flows.
    } finally {
      setBridgeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!open) return;
    void loadBridge();
  }, [open, loadBridge]);

  // Lazy-load the archived emails for this share link. Refetches on every
  // open so a send/followup that just fired shows up without forcing a
  // parent table refresh. Errors stay quiet — the section just renders
  // empty if the read fails.
  const loadArchivedEmails = useCallback(async () => {
    if (!token) return;
    setArchivedLoading(true);
    try {
      const res = await fetch(`/api/calendar/share/${token}/emails`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { emails: ArchivedEmail[] };
      setArchivedEmails(data.emails ?? []);
    } catch {
      setArchivedEmails([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!open) {
      setArchivedEmails(null);
      setViewingEmail(null);
      return;
    }
    void loadArchivedEmails();
  }, [open, loadArchivedEmails]);

  // Refetch bridged videos when a background upload batch finishes for
  // this project. Mirrors EditingProjectDetail so closing the dialog
  // mid-upload doesn't lose progress visibility on reopen.
  const projectId = bridge?.project?.id ?? null;
  useEffect(() => {
    if (!projectId) return;
    return subscribeToCompletion((finished) => {
      if (finished !== projectId) return;
      void loadBridge();
    });
  }, [projectId, loadBridge]);

  // Upload-store snapshot for this project. Uses the stable empty
  // singleton when no project exists yet so the equality check stays
  // happy and we don't infinite-loop on '' fallback.
  const uploadsKey = projectId ?? '';
  const getUploadsSnapshot = useCallback(
    () => getProjectUploads(uploadsKey),
    [uploadsKey],
  );
  const uploads = useSyncExternalStore(
    subscribeUploads,
    getUploadsSnapshot,
    getUploadsSnapshot,
  );

  const startUploads = useCallback(
    async (files: File[]) => {
      if (!token || files.length === 0) return;
      let id = bridge?.project?.id ?? null;
      if (!id) {
        // Find-or-create the bridged editing project on first drop.
        // Lazy create avoids spamming /admin/editing with empty rows.
        if (creatingProject) return;
        setCreatingProject(true);
        try {
          const res = await fetch(
            `/api/calendar/share/${token}/editing-project`,
            { method: 'POST' },
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.id) {
            throw new Error(
              typeof json?.error === 'string' ? json.error : 'Could not create project',
            );
          }
          id = json.id as string;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not start upload');
          return;
        } finally {
          setCreatingProject(false);
        }
      }
      enqueueUploads(id, files);
      toast.info(
        files.length === 1
          ? 'Upload started, you can close this dialog'
          : `${files.length} uploads started, you can close this dialog`,
      );
      // Refresh bridge so the new project + (eventually) videos render.
      EDITING_BRIDGE_CACHE.delete(token);
      void loadBridge();
    },
    [token, bridge?.project?.id, creatingProject, loadBridge],
  );

  const deleteVideo = useCallback(
    async (videoId: string) => {
      if (!projectId || !token) return;
      const ok = await confirmDeleteVideo();
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/admin/editing/projects/${projectId}/videos/${videoId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error('Delete failed');
        toast.success('Deleted');
        EDITING_BRIDGE_CACHE.delete(token);
        await loadBridge();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [projectId, token, loadBridge, confirmDeleteVideo],
  );

  // Always use the API-resolved share_url so the link points at the
  // client's branded host (Nativz vs Anderson Collaborative). For the
  // tiny set of legacy rows that pre-date the field, fall back to
  // resolving via `client_agency` rather than `window.location.origin`
  // — the origin fallback was the leak vector that minted Anderson
  // clients a Nativz URL whenever Jack was logged into nativz.io.
  const shareUrl = useMemo(() => {
    if (!link) return '';
    if (link.share_url) return link.share_url;
    if (!link.token) return '';
    return `${getCortexAppUrl(getBrandFromAgency(link.client_agency))}/s/${link.token}`;
  }, [link]);

  if (!open || !link) return null;

  const isExpired = link.status === 'expired';
  const isAbandoned = link.status === 'abandoned';
  const isApproved = link.status === 'approved';
  const dateRange = formatDateRange(link.drop_start, link.drop_end);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy link');
    }
  }

  // Field-level PATCH for the underlying content_drops row. Used by the
  // Notes textarea on blur. Strategist/editor PATCHes go through the
  // shared AssigneePicker, which we point at the same endpoint via its
  // `patchUrl` prop.
  async function patchDrop(body: Record<string, unknown>) {
    if (!link) return;
    try {
      const res = await fetch(`/api/calendar/drops/${link.drop_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(err?.detail ?? 'Save failed');
      }
      toast.success('Saved');
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function markSent() {
    if (markingSent || !link) return;
    setMarkingSent(true);
    try {
      const res = await fetch(
        `/api/calendar/share/${link.token}/mark-sent`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to record');
      }
      toast.success('Marked sent');
      onSent?.({
        first_sent_at: json.first_sent_at,
        last_sent_at: json.last_sent_at,
        send_count: json.send_count,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record');
    } finally {
      setMarkingSent(false);
    }
  }

  async function markFollowedUp() {
    if (markingFollowup || !link) return;
    setMarkingFollowup(true);
    try {
      const res = await fetch(
        `/api/calendar/share/${link.token}/followup/manual`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to record');
      }
      toast.success('Followup recorded');
      onFollowupRecorded?.({
        last_followup_at: json.last_followup_at,
        followup_count: json.followup_count,
      });
      // The endpoint backfills first_sent_at when it's null (a followup
      // implies the calendar went out). Propagate that so the table's
      // DATE SENT column and unified status pill update without a refetch.
      if (json.first_sent_at && !link.first_sent_at) {
        onSent?.({
          first_sent_at: json.first_sent_at,
          last_sent_at: json.last_sent_at ?? json.first_sent_at,
          send_count: json.send_count ?? 1,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record');
    } finally {
      setMarkingFollowup(false);
    }
  }

  async function markAllApproved() {
    if (markingAllApproved || !link) return;
    const remaining = link.pending_count + link.changes_count;
    if (remaining <= 0) return;
    const ok = await confirmApproveAll();
    if (!ok) return;

    // Snapshot for rollback if the bulk request hard-fails.
    const prevCounts = {
      approved_count: link.approved_count,
      changes_count: link.changes_count,
      pending_count: link.pending_count,
      status: link.status,
    };

    // Optimistic patch — Jack wants the UI to feel instant; per-post
    // Zernio publishes happen in the background.
    setMarkingAllApproved(true);
    onApprovedAll?.({
      approved_count: link.post_count,
      changes_count: 0,
      pending_count: 0,
      status: 'approved',
    });
    toast.success(
      `Approved ${remaining} post${remaining === 1 ? '' : 's'}`,
    );

    try {
      const res = await fetch(
        `/api/calendar/share/${link.token}/approve-all`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to approve');
      }
      const failed = Number(json.failed ?? 0);
      if (failed > 0) {
        toast.error(
          `${failed} post${failed === 1 ? '' : 's'} failed to publish. Check the activity log.`,
        );
      }
      // Reconcile with server-truth counters in case some posts failed
      // (the optimistic patch assumed all succeeded).
      onApprovedAll?.({
        approved_count: Number(json.approved_count ?? link.approved_count),
        changes_count: Number(json.changes_count ?? link.changes_count),
        pending_count: Number(json.pending_count ?? link.pending_count),
        status: (json.status as ReviewLinkStatus) ?? link.status,
      });
    } catch (err) {
      // Hard failure — roll back the optimistic patch.
      onApprovedAll?.(prevCounts);
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setMarkingAllApproved(false);
    }
  }

  async function refreshLink() {
    if (refreshing || !link) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/extend`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Failed to refresh',
        );
      }
      toast.success('Link refreshed');
      setExpiresOverride(json.expires_at);
      setRefreshedThisSession(true);
      onRefreshed?.({ expires_at: json.expires_at });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }

  async function openSendPreview(variant: SendVariant) {
    if (!link) return;
    setPreviewVariant(variant);
    setPreview(null);
    setPreviewError(null);
    setRenderMode('edit');
    setCcSelf(false);
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/share/${link.token}/send?variant=${variant}`,
        { cache: 'no-store' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Failed to load preview',
        );
      }
      const data = json as SendPreview;
      setPreview(data);
      setSubjectDraft(data.subject);
      setMessageDraft(data.message);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeSendPreview() {
    if (sending) return;
    setPreviewVariant(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function confirmSend() {
    if (!link || !preview || !previewVariant || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant: previewVariant,
          // Only forward overrides when the admin actually edited them,
          // so an untouched preview falls through to the server defaults
          // (handy if the variant copy gets tweaked later).
          ...(subjectDraft.trim() !== preview.subject.trim()
            ? { subject: subjectDraft.trim() }
            : {}),
          ...(messageDraft.trim() !== preview.message.trim()
            ? { message: messageDraft.trim() }
            : {}),
          ...(ccSelf ? { cc_self: true } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Send failed');
      }
      toast.success(
        previewVariant === 'initial'
          ? 'Calendar sent to client'
          : 'Revised calendar sent to client',
      );
      onSent?.({
        first_sent_at: json.first_sent_at,
        last_sent_at: json.last_sent_at,
        send_count: json.send_count,
      });
      setPreviewVariant(null);
      setPreview(null);
      // Refresh the archive list so the just-sent email appears in
      // "Past emails" without a parent reload.
      void loadArchivedEmails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const hasBeenSent = !!link.first_sent_at;
  // Hide send actions on terminal links — there's nothing to chase, and
  // clicking through would burn an email on a closed loop. Approved is
  // also terminal: every post got a green check, so no resend / followup
  // makes sense — the unified pill already tells the story.
  const canSend = !isExpired && !isAbandoned && !isApproved && link.post_count > 0;
  const sendDisabledReason =
    contactsLoading
      ? null
      : !contacts || contacts.length === 0
        ? 'Add a contact to the brand profile to send the calendar.'
        : null;

  const showFooter = tab === 'details' && canSend;
  const footer = showFooter ? (
    <>
      {/* Out-of-band send recorder. When the link went out via Gmail
          or Slack instead of the in-app Send button, stamping it
          here keeps DATE SENT honest in the table without firing
          a duplicate email at the client. */}
      {!isExpired && !isAbandoned && !hasBeenSent && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={markSent}
          disabled={markingSent}
          className="text-text-muted hover:text-text-primary"
          title="Record an out-of-band send (Gmail, Slack, manual paste) without firing another email"
        >
          {markingSent ? 'Recording...' : 'Mark sent'}
        </Button>
      )}
      {/* Out-of-band followup recorder. Useful when the chase happened
          on Slack, text, or in person — stamps the table indicator
          without firing another email at the client. Only surfaces
          while the link is still live and pending action. */}
      {!isExpired && !isAbandoned && hasBeenSent && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={markFollowedUp}
          disabled={markingFollowup}
          className="text-text-muted hover:text-text-primary"
          title="Record an out-of-band nudge (Slack, text, in-person) without sending an email"
        >
          {markingFollowup ? 'Recording...' : 'Mark followed up'}
        </Button>
      )}
      {/* Bulk-approve every still-pending post. Skips posts that are
          already approved server-side, so it's safe to click on a
          partially-approved calendar (only the remaining posts move).
          Hidden once everything's approved (the unified pill switches
          and `canSend` becomes false anyway). */}
      {canSend && link.pending_count + link.changes_count > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={markAllApproved}
          disabled={markingAllApproved}
          className="text-text-muted hover:text-text-primary"
          title="Approve every still-pending post and publish them to Zernio"
        >
          <CheckCheck size={13} />
          {markingAllApproved
            ? 'Approving…'
            : `Mark all approved (${link.pending_count + link.changes_count})`}
        </Button>
      )}
      {canSend && (
        <Button
          type="button"
          size="sm"
          onClick={() =>
            openSendPreview(hasBeenSent ? 'revised' : 'initial')
          }
          disabled={!!sendDisabledReason}
          title={sendDisabledReason ?? undefined}
        >
          {hasBeenSent ? <RefreshCcw size={13} /> : <Send size={13} />}
          {hasBeenSent ? 'Send re-review' : 'Send delivery'}
        </Button>
      )}
    </>
  ) : null;

  return (
    <>
      {approveAllDialog}
      {deleteVideoDialog}
      <SendPreviewDialog
        open={!!previewVariant}
        variant={previewVariant ?? 'initial'}
        loading={previewLoading}
        error={previewError}
        preview={preview}
        subject={subjectDraft}
        message={messageDraft}
        renderMode={renderMode}
        sending={sending}
        ccSelf={ccSelf}
        onChangeSubject={setSubjectDraft}
        onChangeMessage={setMessageDraft}
        onChangeRenderMode={setRenderMode}
        onChangeCcSelf={setCcSelf}
        onClose={closeSendPreview}
        onSend={confirmSend}
      />
      <EmailArchiveDialog
        email={viewingEmail}
        onClose={() => setViewingEmail(null)}
      />
      {/* Both dialogs render at once when the preview is open. The native
          <dialog> top-layer stack handles ordering, which avoids the
          old bug where toggling open=false on this parent fired a
          programmatic close event — that cascaded into the parent's
          onClose prop, unmounted the whole tree, and dropped the preview
          state before SendPreviewDialog could render. */}
      <ContentDetailDialog
        open={open}
        onClose={onClose}
        logoUrl={link.client_logo_url}
        brandName={link.client_name ?? 'Client'}
        brandLabel={link.client_name ?? 'Unassigned brand'}
        title={
          <p className="text-lg font-semibold text-text-primary">
            {link.name && link.name.trim().length > 0 ? link.name : dateRange}
          </p>
        }
        headerExtras={
          <>
            <ContentKindBadge kind="calendar" />
            <UnifiedStatusPill
              status={unifiedStatusForShareLink({
                status: link.status,
                first_sent_at: link.first_sent_at,
              })}
            />
            {(isExpired || isAbandoned) && (
              <StatusPill status={link.status} />
            )}
          </>
        }
        tab={tab}
        onTabChange={setTab}
        tabsAriaLabel="Calendar link sections"
        history={
          <ShareHistoryPanel
            endpoint={`/api/calendar/drops/${link.drop_id}/activity`}
            emptyMessage="No activity yet. Mint a share link or send a notification to get started."
            nounSingular="post"
          />
        }
        media={
          <>
            <Section
              label={`Deliverables${
                bridge?.videos?.length ? ` (${bridge.videos.length})` : ''
              }`}
            >
              <EditedVideosBox
                loading={bridgeLoading || creatingProject}
                videos={bridge?.videos ?? []}
                dragActive={dragActive}
                setDragActive={setDragActive}
                onUploadFiles={(files) => void startUploads(files)}
                onDelete={(id) => void deleteVideo(id)}
              />
            </Section>
            {uploads.length > 0 && (
              <Section label="Uploads">
                <div className="rounded-lg border border-nativz-border bg-surface p-3">
                  <ul className="space-y-1.5">
                    {uploads.map((j) => (
                      <UploadRow key={j.id} job={j} />
                    ))}
                  </ul>
                </div>
              </Section>
            )}
          </>
        }
        footer={footer}
      >
        {/* Share link — primary affordance. Sits up top so copying
            the URL takes one click from the table click. The Refresh
            button extends `expires_at` 30 days forward (clears
            `abandoned_at`) so an expired/abandoned link can be revived
            without minting a new token, preserving comments/views. */}
        <Section label="Share link">
          <div className="rounded-lg border border-nativz-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="block w-full truncate rounded-md border border-nativz-border bg-background px-3 py-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={copyShareUrl}
                aria-label="Copy share link"
              >
                <Copy size={13} />
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-md bg-accent-surface/40 px-2.5 text-[12px] font-medium text-accent-text transition-colors hover:bg-accent-surface/60"
              >
                Open
                <ExternalLink size={11} />
              </a>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={refreshLink}
                disabled={refreshing}
                aria-label="Refresh share link"
                title="Push expiry 30 days forward (preserves comments and history)"
              >
                <RefreshCcw size={13} />
                {refreshing
                  ? 'Refreshing...'
                  : refreshedThisSession
                    ? 'Refreshed'
                    : 'Refresh'}
              </Button>
            </div>
            {(isExpired || isAbandoned) && !refreshedThisSession && (
              <p className="mt-2 text-[11px] text-text-muted">
                {isExpired
                  ? 'This link is expired. Visitors will see the expired page on next load.'
                  : 'This link is marked abandoned. The client never approved or revised.'}
              </p>
            )}
          </div>
          <p className="text-[11px] text-text-muted">
            Expires {formatTimestamp(expiresOverride ?? link.expires_at)}
            {hasBeenSent && link.last_sent_at
              ? ` · last sent ${formatRelative(link.last_sent_at)}${link.send_count > 1 ? ` (${link.send_count} sends)` : ''}`
              : ''}
            {typeof link.view_count === 'number'
              ? ` · ${link.view_count} ${link.view_count === 1 ? 'view' : 'views'}`
              : ''}
          </p>
        </Section>

        {/* Recipients. Brand profile is the single source of truth, so
            this list mirrors the brand's POC roster directly. The empty
            state surfaces the actual reason a send would fail (no
            contacts) instead of the previous silent-fail UX. */}
        <Section
          label={
            contacts && contacts.length > 0
              ? `Recipients (${contacts.length})`
              : 'Recipients'
          }
        >
          <div className="rounded-lg border border-nativz-border bg-surface p-3">
            {contactsLoading ? (
              <p className="text-[12px] text-text-muted">Loading recipients…</p>
            ) : !contacts || contacts.length === 0 ? (
              <div className="flex items-start gap-3">
                <Users size={14} className="mt-0.5 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text-secondary">
                    No contacts on the brand profile for {link.client_name ?? 'this brand'}.
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Add a POC on the brand profile before sending.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {contacts.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-text-primary">
                        {c.name?.trim() ? c.name : c.email}
                      </p>
                      {c.name?.trim() && (
                        <p className="truncate text-[11px] text-text-muted">
                          {c.email}
                        </p>
                      )}
                    </div>
                    {c.role?.trim() && (
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {c.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {/* Past emails — replays exactly what the recipient saw,
            keyed by share link. Hidden until at least one row exists so
            the modal stays compact for fresh links. */}
        {archivedEmails && archivedEmails.length > 0 && (
          <Section label={`Past emails (${archivedEmails.length})`}>
            <ul className="divide-y divide-nativz-border overflow-hidden rounded-lg border border-nativz-border bg-surface">
              {archivedEmails.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setViewingEmail(e)}
                    className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <Mail
                      size={14}
                      className="shrink-0 text-text-muted group-hover:text-accent-text"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-text-primary">
                        {e.subject}
                      </p>
                      <p className="truncate text-[11px] text-text-muted">
                        {EMAIL_KIND_LABEL[e.kind] ?? e.kind} · {formatRelative(e.sent_at)}
                        {e.sent_by_label ? ` · by ${e.sent_by_label}` : ''}
                        {e.recipients.length > 0
                          ? ` · ${e.recipients.length} ${e.recipients.length === 1 ? 'recipient' : 'recipients'}`
                          : ''}
                      </p>
                    </div>
                    <ExternalLink
                      size={12}
                      className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {archivedLoading && !archivedEmails && (
          <Section label="Past emails">
            <p className="text-[12px] text-text-muted">Loading…</p>
          </Section>
        )}

        {/* Counts: approved / revising / pending. Mirrors the editing
            modal's same block; placement (right after Past emails) and
            label format (`Posts (N)`) are intentional parity. Skipped
            when the project has zero posts so the modal doesn't read as
            broken for an empty calendar. */}
        {link.post_count > 0 && (
          <Section label={`Posts (${link.post_count})`}>
            <div className="flex flex-wrap gap-2">
              <Counter
                icon={<CheckCircle2 size={12} />}
                label="approved"
                value={link.approved_count}
                tone="success"
              />
              <Counter
                icon={<MessagesSquare size={12} />}
                label="revising"
                value={link.changes_count}
                tone="warning"
              />
              <Counter
                icon={<Eye size={12} />}
                label="pending"
                value={link.pending_count}
                tone="muted"
              />
            </div>
          </Section>
        )}

        {/* Project settings + Notes mirror the editing-project modal
            one-for-one so the unified review modal feels symmetrical
            regardless of which side a row originated on. Status PATCHes
            content_drops.pipeline_status (NULL = compute from share-link
            state, otherwise overrides the unified pill). Strategist /
            Editor and Notes also PATCH the same /api/calendar/drops/[id]
            endpoint; the AssigneePicker is the shared component used by
            the editing modal, pointed at content_drops via `patchUrl`.
            Type is intentionally omitted: it's locked at project
            creation and is not editable in this modal. */}
        <Section label="Project settings">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SideField label="Status">
              <ComboSelect
                value={pipelineStatus ?? ''}
                onChange={(next) => {
                  const value = (next || null) as EditingProjectStatus | null;
                  setPipelineStatus(value);
                  void patchDrop({ pipeline_status: value });
                }}
                options={STATUS_OPTIONS}
                searchable={false}
              />
            </SideField>
            <div />
            <SideField label="Strategist">
              <AssigneePicker
                projectId={link.drop_id}
                role="strategist_id"
                currentUserId={link.strategist_id ?? null}
                currentEmail={link.strategist_email ?? null}
                variant="field"
                patchUrl={`/api/calendar/drops/${link.drop_id}`}
                onSaved={() => onChanged?.()}
              />
            </SideField>
            <SideField label="Editor">
              <AssigneePicker
                projectId={link.drop_id}
                role="editor_id"
                currentUserId={link.editor_id ?? null}
                currentEmail={link.editor_email ?? null}
                variant="field"
                patchUrl={`/api/calendar/drops/${link.drop_id}`}
                onSaved={() => onChanged?.()}
              />
            </SideField>
          </div>
        </Section>

        <Section label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              const next = notes.trim() || null;
              if ((link.notes ?? null) === next) return;
              setSavingNotes(true);
              void patchDrop({ notes: next }).finally(() => setSavingNotes(false));
            }}
            disabled={savingNotes}
            rows={4}
            placeholder="Brief, references, hand-off context..."
            className="block w-full resize-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
        </Section>
      </ContentDetailDialog>
    </>
  );
}

function SendPreviewDialog({
  open,
  variant,
  loading,
  error,
  preview,
  subject,
  message,
  renderMode,
  sending,
  ccSelf,
  onChangeSubject,
  onChangeMessage,
  onChangeRenderMode,
  onChangeCcSelf,
  onClose,
  onSend,
}: {
  open: boolean;
  variant: SendVariant;
  loading: boolean;
  error: string | null;
  preview: SendPreview | null;
  subject: string;
  message: string;
  renderMode: 'edit' | 'preview';
  sending: boolean;
  ccSelf: boolean;
  onChangeSubject: (v: string) => void;
  onChangeMessage: (v: string) => void;
  onChangeRenderMode: (m: 'edit' | 'preview') => void;
  onChangeCcSelf: (v: boolean) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const title =
    variant === 'initial' ? 'Send delivery' : 'Send re-review';
  const subtitle =
    variant === 'initial'
      ? 'Review the recipients and copy before the calendar goes out.'
      : 'Send an updated link with the latest revisions and posts.';

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
        {/* Header — match parent dialog padding so the title clears the
            close button on the right and the dialog edge on the left. */}
        <div className="border-b border-nativz-border py-4 pl-6 pr-14">
          <p className="text-lg font-semibold text-text-primary">{title}</p>
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        </div>

        {loading ? (
          <div className="flex-1 p-8 text-sm text-text-muted">Loading preview…</div>
        ) : error ? (
          <div className="flex-1 space-y-3 p-6 text-sm">
            <p className="text-status-danger">{error}</p>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : preview ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {/* Recipients */}
              <Section label={`Recipients (${preview.recipients.length})`}>
                <div className="flex flex-wrap gap-1.5">
                  {preview.recipients.map((r) => (
                    <span
                      key={r.email}
                      className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary"
                      title={r.email}
                    >
                      <span className="font-medium text-text-primary">
                        {r.name ?? r.email}
                      </span>
                      {r.name && (
                        <span className="text-text-muted">· {r.email}</span>
                      )}
                    </span>
                  ))}
                </div>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[11px] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={ccSelf}
                    onChange={(e) => onChangeCcSelf(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-nativz-border bg-background text-accent focus:ring-1 focus:ring-accent"
                  />
                  CC me on this email
                </label>
              </Section>

              {/* Toggle: edit copy vs render preview */}
              <div className="flex items-center gap-1 rounded-lg border border-nativz-border bg-background p-1 text-xs">
                <button
                  type="button"
                  onClick={() => onChangeRenderMode('edit')}
                  className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                    renderMode === 'edit'
                      ? 'bg-surface text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  Edit copy
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRenderMode('preview')}
                  className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                    renderMode === 'preview'
                      ? 'bg-surface text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  Rendered preview
                </button>
              </div>

              {renderMode === 'edit' ? (
                <>
                  <Section label="Subject">
                    <input
                      value={subject}
                      onChange={(e) => onChangeSubject(e.target.value)}
                      className="block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </Section>
                  <Section label="Message">
                    <textarea
                      value={message}
                      onChange={(e) => onChangeMessage(e.target.value)}
                      rows={10}
                      className="block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </Section>
                  <p className="text-[11px] text-text-muted">
                    Edits stay scoped to this send. The default copy refreshes every time you reopen the dialog.
                  </p>
                </>
              ) : (
                <Section label="Rendered email">
                  <iframe
                    title="Email preview"
                    srcDoc={preview.html}
                    className="h-[420px] w-full rounded-md border border-nativz-border bg-white"
                  />
                  <p className="mt-2 text-[11px] text-text-muted">
                    Layout reference using the default copy. Subject + body edits in the other tab apply at send time.
                  </p>
                </Section>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-nativz-border px-6 py-4">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSend}
                disabled={sending || !subject.trim() || !message.trim()}
              >
                <Send size={13} />
                {sending
                  ? 'Sending…'
                  : variant === 'initial'
                    ? `Send to ${preview.recipients.length} ${preview.recipients.length === 1 ? 'recipient' : 'recipients'}`
                    : `Resend to ${preview.recipients.length} ${preview.recipients.length === 1 ? 'recipient' : 'recipients'}`}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

function Counter({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'muted';
}) {
  const toneClasses: Record<typeof tone, string> = {
    success: 'border-status-success/20 bg-status-success/10 text-status-success',
    warning: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
    muted: 'border-nativz-border bg-surface text-text-secondary',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClasses[tone]}`}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function StatusPill({ status }: { status: ReviewLinkStatus }) {
  const config: Record<
    ReviewLinkStatus,
    { label: string; className: string }
  > = {
    approved: {
      label: 'Approved',
      className: 'bg-status-success/10 text-status-success border-status-success/20',
    },
    revising: {
      label: 'Revising',
      className: 'bg-accent-surface/30 text-accent-text border-accent-text/20',
    },
    ready_for_review: {
      label: 'Ready for review',
      className: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    },
    expired: {
      label: 'Expired',
      className: 'bg-text-muted/10 text-text-muted border-text-muted/20',
    },
    abandoned: {
      label: 'Abandoned',
      className: 'bg-status-danger/10 text-status-danger border-status-danger/20',
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'Calendar';
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sM = s.toLocaleString('default', { month: 'short' });
  const eM = e.toLocaleString('default', { month: 'short' });
  if (s.getMonth() === e.getMonth() && sameYear) {
    return `${sM} ${s.getDate()} to ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${sM} ${s.getDate()} to ${eM} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sM} ${s.getDate()}, ${s.getFullYear()} to ${eM} ${e.getDate()}, ${e.getFullYear()}`;
}
