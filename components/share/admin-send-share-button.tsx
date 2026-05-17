'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCcw, Send } from 'lucide-react';

/**
 * Admin-only Send re-review / Send delivery action surfaced directly on the
 * public share page. Mirrors the same /send (calendar) and /email (editing)
 * endpoints the admin detail pages call. Light by design: fetches the draft
 * preview to confirm variant + recipients, then fires POST with defaults.
 * Full editable preview still lives on the admin detail page; this is the
 * one-tap "client's bugging me, send the re-review email" shortcut.
 */

type Surface = 'calendar' | 'editing';

interface PreviewPayload {
  variant?: 'initial' | 'revised';
  kind?: 'delivery' | 'rereview';
  subject: string;
  recipients: { email: string; name: string | null }[];
}

export function AdminSendShareButton({
  surface,
  previewUrl,
  sendUrl,
  onSent,
}: {
  surface: Surface;
  previewUrl: string;
  sendUrl: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variantKey: 'initial' | 'revised' | null = preview
    ? surface === 'calendar'
      ? preview.variant ?? null
      : preview.kind === 'rereview'
        ? 'revised'
        : 'initial'
    : null;

  const buttonLabel = variantKey === 'revised' ? 'Send re-review' : 'Send delivery';
  const headerLabel = variantKey === 'revised'
    ? 'Send revisions ready email'
    : 'Send delivery email';

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(previewUrl, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : 'Failed to load preview',
        );
      }
      setPreview(json as PreviewPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview || sending) return;
    setSending(true);
    try {
      const body =
        surface === 'calendar'
          ? { variant: preview.variant ?? 'initial' }
          : {};
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Send failed');
      }
      toast.success(
        variantKey === 'revised'
          ? 'Revisions email sent to client'
          : 'Delivery email sent to client',
      );
      setOpen(false);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  // We don't know the variant until we fetch the preview. Use a neutral
  // label on the trigger; the dialog header confirms which variant fires.
  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent-text transition-all hover:bg-accent/20"
        title="Send the share-link email to the brand's POCs"
      >
        <Send size={14} />
        <span className="hidden sm:inline">Send email</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            if (!sending) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-nativz-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {loading ? 'Loading preview…' : headerLabel}
                </h3>
                <p className="mt-1 text-[13px] text-text-muted">
                  {variantKey === 'revised'
                    ? 'Notifies the brand POCs that revisions are ready to review.'
                    : 'Sends the share-link delivery email to the brand POCs.'}
                </p>
              </div>
              {variantKey === 'revised' ? (
                <RefreshCcw size={18} className="mt-1 shrink-0 text-accent-text" />
              ) : (
                <Send size={18} className="mt-1 shrink-0 text-accent-text" />
              )}
            </div>

            {loading && (
              <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                Fetching draft…
              </div>
            )}

            {error && !loading && (
              <div className="rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                {error}
              </div>
            )}

            {preview && !loading && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-text-muted">
                    Subject
                  </div>
                  <div className="text-text-primary">{preview.subject}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-text-muted">
                    Recipients ({preview.recipients.length})
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {preview.recipients.map((r) => (
                      <span
                        key={r.email}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[12px] text-text-secondary"
                        title={r.email}
                      >
                        {r.name || r.email}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-[12px] text-text-muted">
                  For editable copy use the admin detail page. This sends with
                  the default subject and body shown above.
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={sending}
                className="rounded-[var(--nz-btn-radius)] border border-nativz-border bg-transparent px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={sending || loading || !preview}
                className="inline-flex items-center gap-1.5 rounded-[var(--nz-btn-radius)] bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    {variantKey === 'revised' ? (
                      <RefreshCcw size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                    {buttonLabel}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
