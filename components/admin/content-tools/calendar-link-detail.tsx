'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  MessagesSquare,
  Send,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SubNav } from '@/components/ui/sub-nav';
import { ClientLogo } from '@/components/clients/client-logo';
import { ShareHistoryPanel } from './share-history-panel';
import type {
  ReviewLinkRow,
  ReviewLinkStatus,
} from '@/components/scheduler/review-board';

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
 * Detail dialog for a calendar share link (rows with `kind === 'calendar'`
 * in the unified review table). Mirrors the look + feel of
 * `EditingProjectDetail` so the two row types feel like one product.
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
}: {
  link: ReviewLinkRow | null;
  onClose: () => void;
  onRevoked: () => void;
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
}) {
  const open = !!link;
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  // Recipients live on the detail panel itself (not just the send preview)
  // so admins see who'll receive the email *before* clicking send. Empty
  // state matters: if a brand has zero contacts the underlying /send route
  // returns 400, which previously surfaced as a silently-failing button.
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Send preview / dialog state. `null` = closed; setting to a variant
  // pops the modal and kicks off the GET preview fetch.
  const [previewVariant, setPreviewVariant] = useState<SendVariant | null>(null);
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Render toggle: edit the source copy, or eyeball the rendered HTML
  // exactly the way the recipient will see it. Defaults to edit so the
  // dialog opens "ready to tweak the subject", not "ready to send".
  const [renderMode, setRenderMode] = useState<'edit' | 'preview'>('edit');

  // Reset transient UI state when a new link is opened.
  useEffect(() => {
    if (open) {
      setCopied(false);
      setTab('details');
      setPreviewVariant(null);
      setPreview(null);
      setPreviewError(null);
    }
  }, [open, link?.id]);

  // Fetch the brand's POC contacts so the Recipients section shows who
  // will receive the email. Brand profile is the single source of truth.
  const clientId = link?.client_id ?? null;
  useEffect(() => {
    if (!open || !clientId) {
      setContacts(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setContactsLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('failed');
        const data = (await res.json()) as { contacts: ContactRow[] };
        if (!cancelled) setContacts(data.contacts ?? []);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const shareUrl = useMemo(() => {
    if (!link?.token) return '';
    if (typeof window === 'undefined') return `/c/${link.token}`;
    return `${window.location.origin}/c/${link.token}`;
  }, [link?.token]);

  if (!open || !link) return null;

  const isExpired = link.status === 'expired';
  const isAbandoned = link.status === 'abandoned';
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

  async function revoke() {
    if (revoking || !link) return;
    if (!confirm('Revoke this share link? Anyone who has it will see an "expired" page on next visit.')) {
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to revoke');
      }
      toast.success('Link revoked');
      onRevoked();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  }

  async function openSendPreview(variant: SendVariant) {
    if (!link) return;
    setPreviewVariant(variant);
    setPreview(null);
    setPreviewError(null);
    setRenderMode('edit');
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const hasBeenSent = !!link.first_sent_at;
  // Hide send actions on terminal links — there's nothing to chase, and
  // clicking through would burn an email on a closed loop.
  const canSend = !isExpired && !isAbandoned && link.post_count > 0;
  const sendDisabledReason =
    contactsLoading
      ? null
      : !contacts || contacts.length === 0
        ? 'Add a contact to the brand profile to send the calendar.'
        : null;

  return (
    <>
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
        onChangeSubject={setSubjectDraft}
        onChangeMessage={setMessageDraft}
        onChangeRenderMode={setRenderMode}
        onClose={closeSendPreview}
        onSend={confirmSend}
      />
    {/* Both dialogs render at once when the preview is open. The native
        <dialog> top-layer stack handles ordering, which avoids the
        old bug where toggling open=false on this parent fired a
        programmatic close event — that cascaded into the parent's
        onClose prop, unmounted the whole tree, and dropped the preview
        state before SendPreviewDialog could render. */}
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-nativz-border py-4 pl-6 pr-14">
          <ClientLogo
            src={link.client_logo_url}
            name={link.client_name ?? 'Client'}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">
              {link.client_name ?? 'Unassigned brand'}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {link.name && link.name.trim().length > 0 ? link.name : dateRange}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={link.status} />
          </div>
        </div>

        {/* Tabs: Details (default) vs History. History mirrors the
            editing-project dialog and feeds off the drop activity API. */}
        <div className="px-6 pt-3">
          <SubNav
            items={[
              { slug: 'details', label: 'Details' },
              { slug: 'history', label: 'History' },
            ] as const}
            active={tab}
            onChange={(s) => setTab(s)}
            ariaLabel="Calendar link sections"
          />
        </div>

        {/* Body */}
        {tab === 'history' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <ShareHistoryPanel
              endpoint={`/api/calendar/drops/${link.drop_id}/activity`}
              emptyMessage="No activity yet. Mint a share link or send a notification to get started."
            />
          </div>
        ) : (
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Share link — primary affordance. Sits up top so copying
              the URL takes one click from the table click. */}
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
              </div>
              {(isExpired || isAbandoned) && (
                <p className="mt-2 text-[11px] text-text-muted">
                  {isExpired
                    ? 'This link is expired. Visitors will see the expired page on next load.'
                    : 'This link is marked abandoned. The client never approved or revised.'}
                </p>
              )}
            </div>
            {hasBeenSent && link.last_sent_at && (
              <p className="text-[11px] text-text-muted">
                Last sent {formatRelative(link.last_sent_at)}
                {link.send_count > 1 ? ` · ${link.send_count} sends` : ''}
              </p>
            )}
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

          {/* Counts: approved / revising / pending. Skipped when the
              project has zero posts so the modal doesn't read as broken
              for an empty calendar. */}
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

          {/* Project metadata. Date range + last-viewed are the only
              two fields that actually drive Jack's followup decision. */}
          <Section label="Project">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Date range">
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <CalendarDays size={12} className="text-text-tertiary" />
                  {dateRange}
                </span>
              </Field>
              <Field label="Last viewed">
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <Clock3 size={12} className="text-text-tertiary" />
                  {link.last_viewed_at ? formatRelative(link.last_viewed_at) : 'Never'}
                </span>
              </Field>
              <Field label="Created">
                <span className="text-text-secondary">
                  {formatTimestamp(link.created_at)}
                </span>
              </Field>
              <Field label="Expires">
                <span className="text-text-secondary">
                  {formatTimestamp(link.expires_at)}
                </span>
              </Field>
              {link.followup_count > 0 && (
                <Field label="Follow-ups sent">
                  <span className="text-text-secondary">
                    {link.followup_count}
                    {link.last_followup_at ? ` (last ${formatRelative(link.last_followup_at)})` : ''}
                  </span>
                </Field>
              )}
              {link.abandoned_at && (
                <Field label="Abandoned">
                  <span className="text-text-secondary">
                    {formatTimestamp(link.abandoned_at)}
                  </span>
                </Field>
              )}
            </dl>
          </Section>

        </div>
        )}

        {/* Footer actions. Revoke (destructive) sits to the left of the
            primary Send/Resend CTA. Both are right-aligned so the
            destructive button never lands closest to the close X. */}
        {tab === 'details' && (canSend || !isExpired) && (
          <div className="flex items-center justify-end gap-2 border-t border-nativz-border px-6 py-4">
            {!isExpired && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={revoke}
                disabled={revoking}
                className="text-status-danger hover:bg-status-danger/10"
              >
                {revoking ? 'Revoking...' : 'Revoke link'}
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
                {hasBeenSent ? 'Resend (revised)' : 'Send share link'}
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
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
  onChangeSubject: (v: string) => void;
  onChangeMessage: (v: string) => void;
  onChangeRenderMode: (m: 'edit' | 'preview') => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const title =
    variant === 'initial' ? 'Send share link' : 'Resend (revised)';

  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
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

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('default', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
