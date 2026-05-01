'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Eye,
  Link2,
  Loader2,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * "Share for review" button that lives in the editing project detail
 * header. Mints a public review link (POST /share), shows the freshly
 * minted URL with a copy button, and lists prior links + view counts so
 * the editor can see whether a client has actually opened the page.
 *
 * Mirrors the social calendar share flow but the public surface is
 * `/c/edit/<token>` (no captions, just the cuts).
 */

interface ShareLink {
  id: string;
  url: string;
  created_at: string;
  expires_at: string;
  last_viewed_at: string | null;
  /** Most recent delivery/re-review email send. Null = never sent. */
  last_review_email_sent_at: string | null;
  revoked: boolean;
  view_count: number;
  /** Videos with version > 1 uploaded after `last_review_email_sent_at`. */
  pending_revision_count: number;
  /** `delivery` for the first send, `rereview` once a delivery has gone out. */
  kind: 'delivery' | 'rereview';
  views: { viewed_at: string; viewer_name: string | null }[];
}

export function EditingShareButton({
  projectId,
  hasVideos,
}: {
  projectId: string;
  hasVideos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);
  const [emailLinkId, setEmailLinkId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to load share links');
      const body = (await res.json()) as { links: ShareLink[] };
      setLinks(body.links);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  async function mintAndCopy() {
    if (!hasVideos) {
      toast.error('Upload at least one edited cut before sharing.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { method: 'POST' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? 'Failed to mint link');
      const url = body.url as string;
      await copy(url);
      toast.success('Review link copied to clipboard');
      setJustCopiedId(body.link.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mint link');
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string, linkId?: string) {
    try {
      await navigator.clipboard.writeText(url);
      if (linkId) {
        setJustCopiedId(linkId);
        setTimeout(
          () => setJustCopiedId((id) => (id === linkId ? null : id)),
          1500,
        );
      }
    } catch {
      toast.error('Could not copy. Long-press the URL to copy manually.');
    }
  }

  async function revoke(linkId: string) {
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share?linkId=${linkId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to revoke');
      toast.success('Link revoked');
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    }
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Share for review">
          <Share2 size={14} />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-96 p-0"
        matchAnchorWidth={false}
        disablePortal
      >
        <div className="border-b border-nativz-border p-3">
          <p className="text-sm font-medium text-text-primary">
            Share for review
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Anyone with the link can watch the cuts. No login required.
          </p>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => void mintAndCopy()}
            disabled={creating || !hasVideos}
          >
            {creating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Minting link...
              </>
            ) : (
              <>
                <Link2 size={14} />
                Create + copy link
              </>
            )}
          </Button>
          {!hasVideos ? (
            <p className="mt-2 text-xs text-text-muted">
              Upload at least one edited cut to enable sharing.
            </p>
          ) : null}
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Active links
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="animate-spin text-text-muted" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-2 text-xs text-text-muted">No links yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="rounded-lg border border-nativz-border bg-surface p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                      {link.url}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copy(link.url, link.id)}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-nativz-border px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
                    >
                      {justCopiedId === link.id ? (
                        <>
                          <Check size={11} />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye size={11} />
                      {link.view_count}{' '}
                      {link.view_count === 1 ? 'view' : 'views'}
                      {link.last_viewed_at ? (
                        <>
                          {' · last '}
                          {timeAgo(link.last_viewed_at)}
                        </>
                      ) : (
                        ' · not opened yet'
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEmailLinkId(link.id)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent-text"
                      >
                        <Send size={11} />
                        {link.kind === 'rereview'
                          ? link.pending_revision_count > 0
                            ? `Send re-review · ${link.pending_revision_count}`
                            : 'Send re-review'
                          : 'Send delivery'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void revoke(link.id)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger"
                      >
                        <Trash2 size={11} />
                        Revoke
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
    {emailLinkId && (
      <SendToClientDialog
        projectId={projectId}
        linkId={emailLinkId}
        onClose={() => setEmailLinkId(null)}
        onSent={() => {
          setEmailLinkId(null);
          void load();
        }}
      />
    )}
    </>
  );
}

interface DeliverableDraft {
  subject: string;
  message: string;
  recipients: { email: string; name: string | null }[];
  client_name: string;
  project_name: string;
  share_url: string;
  /**
   * `delivery` for the first send on a link, `rereview` once a previous
   * delivery has gone out (so the dialog title + button + body switch).
   */
  kind: 'delivery' | 'rereview';
  /**
   * Number of `version > 1` videos uploaded since the last review email.
   * Surfaced in the dialog header so the admin sees what they're sending.
   */
  pending_count: number;
}

/**
 * Preview + edit the deliverable email before it goes out. Mirrors the
 * calendar followup draft dialog: GET pulls the auto-composed copy and
 * the recipient list (POCs from the brand's review contacts), the admin
 * tweaks subject/body inline, and POST sends it via Resend through the
 * shared sendAndLog logger.
 */
function SendToClientDialog({
  projectId,
  linkId,
  onClose,
  onSent,
}: {
  projectId: string;
  linkId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeliverableDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/admin/editing/projects/${projectId}/share/${linkId}/email`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => ({}))) as
          | (DeliverableDraft & { error?: never })
          | { error: string };
        if (cancelled) return;
        if (!res.ok || 'error' in data) {
          throw new Error(('error' in data && data.error) || 'Could not load draft');
        }
        setDraft(data);
        setSubject(data.subject);
        setMessage(data.message);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load draft');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, linkId]);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share/${linkId}/email`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            subject: subject.trim(),
            message: message.trim(),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recipients_count?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
      const count = data.recipients_count ?? draft?.recipients.length ?? 0;
      const word = count === 1 ? 'contact' : 'contacts';
      toast.success(count ? `Sent to ${count} ${word}` : 'Email sent');
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const recipientsLine = draft?.recipients.length
    ? draft.recipients
        .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
        .join(', ')
    : '';

  const canSend =
    !sending &&
    !loading &&
    !loadError &&
    subject.trim().length > 0 &&
    message.trim().length > 0;

  const isRereview = draft?.kind === 'rereview';
  const dialogTitle = isRereview ? 'Send re-review email' : 'Send cuts for review';
  const sendLabel = isRereview ? 'Send re-review' : 'Send';
  const helperCopy = isRereview
    ? 'Blank lines start a new paragraph. The branded layout and the “Watch the revised cuts” button are added automatically.'
    : 'Blank lines start a new paragraph. The branded layout and the “Watch the cuts” button are added automatically.';

  return (
    <Dialog open onClose={onClose} title={dialogTitle} maxWidth="xl">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-text-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="ml-2 text-sm">Loading draft...</span>
        </div>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="text-sm text-status-danger">{loadError}</p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {isRereview && draft ? (
            <div className="rounded-md border border-accent-text/30 bg-accent-text/5 px-3 py-2 text-sm text-text-secondary">
              {draft.pending_count > 0
                ? `Sending re-review for ${draft.pending_count} revised ${
                    draft.pending_count === 1 ? 'cut' : 'cuts'
                  } uploaded since the last email.`
                : 'Sending another re-review on this link.'}
            </div>
          ) : null}

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
              To
            </div>
            <div className="mt-1 text-sm text-text-secondary">
              {recipientsLine || 'No recipients'}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text"
              maxLength={200}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Message
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="mt-1 block w-full resize-y rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text"
              maxLength={5000}
            />
            <span className="mt-1 block text-xs text-text-muted">
              {helperCopy}
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={!canSend}>
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  {sendLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
