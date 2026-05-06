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
  Eye,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MessagesSquare,
  RefreshCcw,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ComboSelect } from '@/components/ui/combo-select';
import {
  EDITING_STATUS_LABEL,
  EDITING_TYPE_LABEL,
  type EditingProject,
  type EditingProjectStatus,
  type EditingProjectType,
  type EditingProjectVideo,
} from '@/lib/editing/types';
import { AssigneePicker } from './assignee-picker';
import { ShareHistoryPanel } from './share-history-panel';
import { EditedVideosBox, UploadRow } from './edited-videos-box';
import {
  ContentDetailDialog,
  type DetailTab,
} from './detail-dialog/dialog-shell';
import { Section, SideField } from './detail-dialog/section';
import { formatRelative, formatTimestamp } from './detail-dialog/format';
import {
  EmailArchiveDialog,
  EMAIL_KIND_LABEL,
  type ArchivedEmail,
} from './detail-dialog/email-archive-dialog';
import {
  ContentKindBadge,
  UnifiedStatusPill,
} from './detail-dialog/unified-status-pill';
import { unifiedStatusForEditingProject } from '@/lib/content-tools/unified-status';
import { nounForProjectType } from '@/lib/editing/project-noun';
import {
  enqueueUploads,
  getProjectUploads,
  subscribe as subscribeUploads,
  subscribeToCompletion,
} from '@/lib/editing/upload-store';

/**
 * Detail panel for a single editing project. Drives:
 *
 *   - Inline rename, type change, status flip, notes
 *   - Drag-drop multi-video upload of edited cuts
 *   - Raw footage as a single Drive folder URL link
 *   - Share link lifecycle: mint, copy, send/resend, revisions-complete,
 *     revoke. The Send action mirrors the calendar pattern exactly: a
 *     SendPreviewDialog with edit/preview render mode toggle, defaulting
 *     to delivery vs re-review based on whether the link has been sent.
 */

const STATUS_OPTIONS: { value: EditingProjectStatus; label: string }[] = (
  Object.keys(EDITING_STATUS_LABEL) as EditingProjectStatus[]
).map((value) => ({ value, label: EDITING_STATUS_LABEL[value] }));

const TYPE_OPTIONS: { value: EditingProjectType; label: string }[] = (
  Object.keys(EDITING_TYPE_LABEL) as EditingProjectType[]
).map((value) => ({ value, label: EDITING_TYPE_LABEL[value] }));

interface DetailResponse {
  project: EditingProject;
  videos: EditingProjectVideo[];
  raw_videos?: unknown[];
}

type SendVariant = 'delivery' | 'rereview';

interface ShareLinkRow {
  id: string;
  url: string;
  created_at: string;
  expires_at: string;
  last_viewed_at: string | null;
  last_review_email_sent_at: string | null;
  revoked: boolean;
  view_count: number;
  pending_revision_count: number;
  kind: SendVariant;
  revisions_status: 'none' | 'unresolved' | 'ready_to_send' | 'sent';
  revisions_total: number;
  revisions_unresolved: number;
  revisions_complete_notified_at: string | null;
}

interface SendPreview {
  subject: string;
  message: string;
  recipients: { email: string; name: string | null }[];
  client_name: string;
  project_name: string;
  share_url: string;
  kind: SendVariant;
  pending_count: number;
}

interface ContactRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

/**
 * Module-level cache for brand POC contacts. Mirrors the calendar modal
 * cache so reopening the dialog for a recently-viewed brand renders the
 * recipient list instantly while we revalidate underneath.
 */
const CONTACTS_CACHE = new Map<string, ContactRow[]>();

export function EditingProjectDetail({
  project,
  onClose,
  onChanged,
}: {
  project: EditingProject | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = !!project;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [type, setType] = useState<EditingProjectType>('organic_content');
  const [status, setStatus] = useState<EditingProjectStatus>('editing');
  const [dragActive, setDragActive] = useState(false);
  const [tab, setTab] = useState<DetailTab>('details');

  // Share links + send preview state. The first non-revoked link is the
  // current one; everything else is history (covered by the activity tab).
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[] | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Optimistic override for the displayed expiry after a successful
  // "Refresh link" action. Cleared when the dialog opens. Lets the
  // inline expiry text update instantly without a parent refetch.
  const [expiresOverride, setExpiresOverride] = useState<string | null>(null);
  const [refreshedThisSession, setRefreshedThisSession] = useState(false);
  const [copied, setCopied] = useState(false);
  const [firingRevisions, setFiringRevisions] = useState(false);

  const [previewVariant, setPreviewVariant] = useState<SendVariant | null>(null);
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [renderMode, setRenderMode] = useState<'edit' | 'preview'>('edit');

  // Recipients (brand POC roster) for the Recipients section.
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Past emails archive.
  const [archivedEmails, setArchivedEmails] = useState<ArchivedEmail[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<ArchivedEmail | null>(null);

  const projectId = project?.id ?? null;
  const clientId = project?.client_id ?? null;

  const uploadsKey = projectId ?? '';
  const getSnapshot = useCallback(
    () => getProjectUploads(uploadsKey),
    [uploadsKey],
  );
  const uploads = useSyncExternalStore(
    subscribeUploads,
    getSnapshot,
    getSnapshot,
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load project');
      const body = (await res.json()) as DetailResponse;
      setData(body);
      setName(body.project.name);
      setNotes(body.project.notes ?? '');
      setDriveUrl(body.project.drive_folder_url ?? '');
      setType(body.project.project_type);
      setStatus(body.project.status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadShareLinks = useCallback(async () => {
    if (!projectId) return;
    setShareLoading(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to load share links');
      const body = (await res.json()) as { links: ShareLinkRow[] };
      setShareLinks(body.links ?? []);
    } catch {
      setShareLinks([]);
    } finally {
      setShareLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      void load();
      void loadShareLinks();
      setExpiresOverride(null);
      setRefreshedThisSession(false);
    } else {
      setData(null);
      setTab('details');
      setArchivedEmails(null);
      setViewingEmail(null);
      setShareLinks(null);
      setPreviewVariant(null);
      setPreview(null);
      setPreviewError(null);
      setCopied(false);
    }
  }, [open, load, loadShareLinks]);

  // Brand POC contacts. Cache hit shows instantly; revalidate in background.
  useEffect(() => {
    if (!open || !clientId) {
      setContacts(null);
      return;
    }
    const cached = CONTACTS_CACHE.get(clientId) ?? null;
    setContacts(cached);
    let cancelled = false;
    void (async () => {
      if (cached === null) setContactsLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as { contacts: ContactRow[] };
        if (cancelled) return;
        const next = json.contacts ?? [];
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

  const loadArchivedEmails = useCallback(async () => {
    if (!projectId) return;
    setArchivedLoading(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/emails`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as { emails: ArchivedEmail[] };
      setArchivedEmails(body.emails ?? []);
    } catch {
      setArchivedEmails([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void loadArchivedEmails();
  }, [open, loadArchivedEmails]);

  useEffect(() => {
    if (!projectId) return;
    return subscribeToCompletion((finishedProjectId) => {
      if (finishedProjectId !== projectId) return;
      void load();
    });
  }, [projectId, load]);

  async function patch(body: Record<string, unknown>) {
    if (!projectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(err?.detail ?? 'Save failed');
      }
      toast.success('Saved');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!projectId) return;
    if (!confirm('Archive this project? You can restore it later.')) return;
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Archive failed');
      toast.success('Archived');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed');
    }
  }

  async function deleteVideo(videoId: string) {
    if (!projectId) return;
    if (!confirm('Delete this video? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/videos/${videoId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Deleted');
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function startUploads(files: File[]) {
    if (!projectId || files.length === 0) return;
    enqueueUploads(projectId, files);
    toast.info(
      files.length === 1
        ? 'Upload started, you can close this dialog'
        : `${files.length} uploads started, you can close this dialog`,
    );
  }

  // First non-revoked link is the active one. The endpoint returns links
  // ordered by created_at desc with archived filtered out, so the head
  // element is the right pick when present.
  const activeLink = useMemo<ShareLinkRow | null>(() => {
    if (!shareLinks) return null;
    return shareLinks.find((l) => !l.revoked) ?? null;
  }, [shareLinks]);

  const hasVideos = (data?.videos.length ?? 0) > 0;

  async function mintShareLink() {
    if (!projectId || minting) return;
    setMinting(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof json?.detail === 'string'
            ? json.detail
            : typeof json?.error === 'string'
              ? json.error
              : 'Could not mint link';
        throw new Error(err);
      }
      toast.success('Share link created');
      await loadShareLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not mint link');
    } finally {
      setMinting(false);
    }
  }

  async function copyShareUrl() {
    if (!activeLink) return;
    try {
      await navigator.clipboard.writeText(activeLink.url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy link');
    }
  }

  async function refreshLink() {
    if (!projectId || !activeLink || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share/${activeLink.id}/extend`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Failed to refresh',
        );
      }
      toast.success('Link refreshed');
      setExpiresOverride(json.expires_at);
      setRefreshedThisSession(true);
      // Refetch in the background so the activity panel + canonical
      // expiry land without forcing a full reload.
      void loadShareLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }

  async function fireRevisionsComplete() {
    if (!projectId || !activeLink || firingRevisions) return;
    if (
      !confirm(
        'Send the "revisions complete" email to the brand contacts? This fires immediately.',
      )
    ) {
      return;
    }
    setFiringRevisions(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share/${activeLink.id}/revisions-complete`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Send failed',
        );
      }
      toast.success('Revisions-complete email sent');
      await loadShareLinks();
      void loadArchivedEmails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setFiringRevisions(false);
    }
  }

  async function openSendPreview(variant: SendVariant) {
    if (!projectId || !activeLink) return;
    setPreviewVariant(variant);
    setPreview(null);
    setPreviewError(null);
    setRenderMode('edit');
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share/${activeLink.id}/email`,
        { cache: 'no-store' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Failed to load preview',
        );
      }
      const dataPreview = json as SendPreview;
      setPreview(dataPreview);
      setSubjectDraft(dataPreview.subject);
      setMessageDraft(dataPreview.message);
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
    if (!projectId || !activeLink || !preview || !previewVariant || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share/${activeLink.id}/email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(subjectDraft.trim() !== preview.subject.trim()
              ? { subject: subjectDraft.trim() }
              : {}),
            ...(messageDraft.trim() !== preview.message.trim()
              ? { message: messageDraft.trim() }
              : {}),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Send failed');
      }
      toast.success(
        previewVariant === 'delivery'
          ? 'Delivery email sent'
          : 'Re-review email sent',
      );
      setPreviewVariant(null);
      setPreview(null);
      await loadShareLinks();
      void loadArchivedEmails();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (!open || !project) return null;

  const sendDisabledReason = contactsLoading
    ? null
    : !contacts || contacts.length === 0
      ? 'Add a contact to the brand profile to send the link.'
      : null;

  const showRevisionsCta =
    activeLink?.revisions_status === 'ready_to_send' && !sendDisabledReason;
  const hasBeenSent = !!activeLink?.last_review_email_sent_at;
  // Project is in a terminal approved state — hide the Send re-review /
  // revisions-complete CTAs so we don't burn an email on a closed loop.
  // Archive stays available; the unified pill carries the "Approved" signal.
  const isApproved =
    project.status === 'approved' ||
    project.status === 'done' ||
    project.status === 'archived';

  const footer = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={archive}
        className="text-text-muted hover:text-[color:var(--status-danger)]"
      >
        <Trash2 size={13} />
        Delete project
      </Button>
      {activeLink && showRevisionsCta && !isApproved && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={fireRevisionsComplete}
          disabled={firingRevisions}
          title="Notify the brand that every revision request on this link is resolved."
        >
          {firingRevisions ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CheckCheck size={13} />
          )}
          {firingRevisions ? 'Sending...' : 'Send revisions complete'}
        </Button>
      )}
      {!activeLink && hasVideos && !isApproved && (
        <Button
          type="button"
          size="sm"
          onClick={mintShareLink}
          disabled={minting}
        >
          {minting ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
          {minting ? 'Creating...' : 'Create share link'}
        </Button>
      )}
      {activeLink && !isApproved && (
        <Button
          type="button"
          size="sm"
          onClick={() => openSendPreview(hasBeenSent ? 'rereview' : 'delivery')}
          disabled={!!sendDisabledReason}
          title={sendDisabledReason ?? undefined}
        >
          {hasBeenSent ? <RefreshCcw size={13} /> : <Send size={13} />}
          {hasBeenSent ? 'Send re-review' : 'Send delivery'}
        </Button>
      )}
    </>
  );

  return (
    <>
      <SendPreviewDialog
        open={!!previewVariant}
        variant={previewVariant ?? 'delivery'}
        loading={previewLoading}
        error={previewError}
        preview={preview}
        subject={subjectDraft}
        message={messageDraft}
        renderMode={renderMode}
        sending={sending}
        pendingCount={activeLink?.pending_revision_count ?? 0}
        onChangeSubject={setSubjectDraft}
        onChangeMessage={setMessageDraft}
        onChangeRenderMode={setRenderMode}
        onClose={closeSendPreview}
        onSend={confirmSend}
      />
      <EmailArchiveDialog
        email={viewingEmail}
        onClose={() => setViewingEmail(null)}
      />
      <ContentDetailDialog
        open={open}
        onClose={onClose}
        logoUrl={project.client_logo_url}
        brandName={project.client_name ?? 'Client'}
        brandLabel={project.client_name ?? 'Unassigned brand'}
        title={
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== project.name) void patch({ name: name.trim() });
            }}
            className="-ml-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-text-primary transition-colors hover:border-nativz-border focus:border-accent focus:outline-none"
          />
        }
        headerExtras={
          <>
            {saving && <Loader2 size={14} className="animate-spin text-text-muted" />}
            <ContentKindBadge kind="editing" />
            <UnifiedStatusPill status={unifiedStatusForEditingProject(status)} />
          </>
        }
        tab={tab}
        onTabChange={setTab}
        tabsAriaLabel="Project sections"
        history={
          projectId && (
            <ShareHistoryPanel
              endpoint={`/api/admin/editing/projects/${projectId}/activity`}
              nounSingular={nounForProjectType(type).singular}
            />
          )
        }
        media={
          <>
            <Section label="Raw footage">
              <div className="rounded-lg border border-nativz-border bg-surface p-3">
                <input
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  onBlur={() => {
                    const trimmed = driveUrl.trim();
                    void patch({ drive_folder_url: trimmed || null });
                  }}
                  placeholder="Paste a Google Drive folder link"
                  className="block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent-text hover:underline"
                  >
                    Open folder <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </Section>

            <Section
              label={`Deliverables${
                data?.videos.length ? ` (${data.videos.length})` : ''
              }`}
            >
              <EditedVideosBox
                loading={loading}
                videos={data?.videos ?? []}
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

        {/* Share link. Single primary affordance: copy + open + refresh.
            Refresh extends `expires_at` 30 days forward so the link stays
            live without minting a new token (preserves comments/views).
            Empty state surfaces "Mint share link" inline when at least
            one video exists; the no-videos case stays in the
            EditedVideosBox empty state. */}
        <Section label="Share link">
          {shareLoading && shareLinks === null ? (
            <p className="text-[12px] text-text-muted">Loading…</p>
          ) : activeLink ? (
            <>
              <div className="rounded-lg border border-nativz-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activeLink.url}
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
                    href={activeLink.url}
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
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
                  <span>
                    {activeLink.view_count} {activeLink.view_count === 1 ? 'view' : 'views'}
                  </span>
                  {activeLink.last_review_email_sent_at && (
                    <span>· Last sent {formatRelative(activeLink.last_review_email_sent_at)}</span>
                  )}
                  {activeLink.kind === 'rereview' && activeLink.pending_revision_count > 0 && (
                    <span className="text-accent-text">
                      · {activeLink.pending_revision_count} new {activeLink.pending_revision_count === 1 ? 'revision' : 'revisions'} since last send
                    </span>
                  )}
                  {activeLink.revisions_status === 'unresolved' && (
                    <span className="text-status-warning">
                      · {activeLink.revisions_unresolved} unresolved {activeLink.revisions_unresolved === 1 ? 'revision' : 'revisions'}
                    </span>
                  )}
                  {activeLink.revisions_status === 'sent' && (
                    <span className="text-status-success">· Revisions-complete sent</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-text-muted">
                Expires {formatTimestamp(expiresOverride ?? activeLink.expires_at)}
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-nativz-border bg-surface p-3">
              {hasVideos ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-text-secondary">
                      No active share link.
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Create one to share these cuts with the brand for review.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={mintShareLink}
                    disabled={minting}
                    className="shrink-0"
                  >
                    {minting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Link2 size={13} />
                    )}
                    {minting ? 'Creating...' : 'Create share link'}
                  </Button>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted">
                  Upload at least one edited cut before minting a share link.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Recipients. Brand profile POC roster. Empty state surfaces the
            actual reason a send would fail so admins fix it before clicking
            Send instead of after. */}
        <Section
          label={
            contacts && contacts.length > 0
              ? `Recipients (${contacts.length})`
              : 'Recipients'
          }
        >
          <div className="rounded-lg border border-nativz-border bg-surface p-3">
            {contactsLoading && !contacts ? (
              <p className="text-[12px] text-text-muted">Loading recipients…</p>
            ) : !contacts || contacts.length === 0 ? (
              <div className="flex items-start gap-3">
                <Users size={14} className="mt-0.5 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text-secondary">
                    No contacts on the brand profile for{' '}
                    {project.client_name ?? 'this brand'}.
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

        {/* Past emails — replays the rendered HTML the recipients actually
            got. Hidden until at least one row exists so fresh projects stay
            compact. */}
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

        {(data?.videos.length ?? 0) > 0 && (
          <Section
            label={`${nounForProjectType(type).plural[0].toUpperCase()}${nounForProjectType(type).plural.slice(1)} (${data?.videos.length ?? 0})`}
          >
            <ReviewCounters videos={data?.videos ?? []} />
          </Section>
        )}

        <Section label="Project settings">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SideField label="Status">
              <ComboSelect
                value={status}
                onChange={(next) => {
                  const value = next as EditingProjectStatus;
                  setStatus(value);
                  void patch({ status: value });
                }}
                options={STATUS_OPTIONS}
                searchable={false}
              />
            </SideField>
            <SideField label="Type">
              <ComboSelect
                value={type}
                onChange={(next) => {
                  const value = next as EditingProjectType;
                  setType(value);
                  void patch({ project_type: value });
                }}
                options={TYPE_OPTIONS}
                searchable={false}
              />
            </SideField>
            <SideField label="Strategist">
              <AssigneePicker
                projectId={project.id}
                role="strategist_id"
                currentUserId={
                  data?.project.strategist_id ?? project.strategist_id
                }
                currentEmail={
                  data?.project.strategist_email ?? project.strategist_email
                }
                variant="field"
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
            </SideField>
            <SideField label="Editor">
              <AssigneePicker
                projectId={project.id}
                role="editor_id"
                currentUserId={data?.project.editor_id ?? project.editor_id}
                currentEmail={
                  data?.project.editor_email ?? project.editor_email
                }
                variant="field"
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
            </SideField>
          </div>
        </Section>

        <Section label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              void patch({ notes: notes.trim() || null });
            }}
            rows={4}
            placeholder="Brief, references, hand-off context..."
            className="block w-full resize-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </Section>

      </ContentDetailDialog>
    </>
  );
}

function ReviewCounters({ videos }: { videos: EditingProjectVideo[] }) {
  let approved = 0;
  let changes = 0;
  let pending = 0;
  for (const v of videos) {
    if (v.review_status === 'approved') approved += 1;
    else if (v.review_status === 'changes_requested') changes += 1;
    else pending += 1;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <CounterPill
        icon={<CheckCircle2 size={12} />}
        label="approved"
        value={approved}
        tone="success"
      />
      <CounterPill
        icon={<MessagesSquare size={12} />}
        label="revising"
        value={changes}
        tone="warning"
      />
      <CounterPill
        icon={<Eye size={12} />}
        label="pending"
        value={pending}
        tone="muted"
      />
    </div>
  );
}

function CounterPill({
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
  pendingCount,
  onChangeSubject,
  onChangeMessage,
  onChangeRenderMode,
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
  pendingCount: number;
  onChangeSubject: (v: string) => void;
  onChangeMessage: (v: string) => void;
  onChangeRenderMode: (m: 'edit' | 'preview') => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const title = variant === 'delivery' ? 'Send delivery email' : 'Send re-review email';
  const subtitle =
    variant === 'delivery'
      ? 'Notify the brand that the first cuts are ready to review.'
      : pendingCount > 0
        ? `Send an updated link with ${pendingCount} new ${pendingCount === 1 ? 'cut' : 'cuts'}.`
        : 'Send a re-review prompt to the brand.';

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
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
                      {r.name && <span className="text-text-muted">· {r.email}</span>}
                    </span>
                  ))}
                </div>
              </Section>

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
                  <p className="text-[11px] text-text-muted">
                    The rendered email uses the default copy as a layout reference. Subject and message edits apply at send time.
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
                  : variant === 'delivery'
                    ? `Send delivery to ${preview.recipients.length} ${preview.recipients.length === 1 ? 'recipient' : 'recipients'}`
                    : `Send re-review to ${preview.recipients.length} ${preview.recipients.length === 1 ? 'recipient' : 'recipients'}`}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
