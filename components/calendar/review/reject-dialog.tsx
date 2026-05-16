'use client';

/**
 * CUP-03 T05: reject-with-note dialog for the SMM review surface.
 * Wraps the existing Dialog primitive. Required textarea (1-2000 chars).
 * Posts to /api/calendar/drops/[id]/handoff/reject (cup-01 route).
 */

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const MAX_NOTE = 2000;

interface RejectDialogProps {
  open: boolean;
  dropId: string;
  /** When true, the reject sends the drop back to `editing` instead of `smm_rejected`. */
  sendBackToEditor?: boolean;
  onClose: () => void;
  onRejected?: () => void;
}

export function RejectDialog({
  open,
  dropId,
  sendBackToEditor = false,
  onClose,
  onRejected,
}: RejectDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = note.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_NOTE && !submitting;

  function handleClose() {
    if (submitting) return;
    setNote('');
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/drops/${dropId}/handoff/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: trimmed,
          targetState: sendBackToEditor ? 'editing' : 'smm_rejected',
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `reject failed (${res.status})`);
      }
      setNote('');
      onRejected?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setSubmitting(false);
    }
  }

  const heading = sendBackToEditor ? 'Send back to editor' : 'Reject with note';
  const helper = sendBackToEditor
    ? 'Tell the editor what to change. They will see this note when they reopen the drop.'
    : 'Add a note for the editor. They will see this when they reopen the drop.';

  return (
    <Dialog open={open} onClose={handleClose} title={heading} maxWidth="lg">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{helper}</p>

        <div>
          <label
            htmlFor="reject-note"
            className="block text-xs uppercase tracking-wide text-text-muted"
          >
            Note
          </label>
          <textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            placeholder="What needs to change?"
            rows={6}
            disabled={submitting}
            className="mt-1 w-full resize-y rounded-lg border border-nativz-border bg-background/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text disabled:opacity-60"
          />
          <div className="mt-1 flex justify-between text-xs text-text-muted">
            <span>Required</span>
            <span>
              {trimmed.length}/{MAX_NOTE}
            </span>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="md" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={sendBackToEditor ? 'primary' : 'danger'}
            size="md"
            onClick={handleSubmit}
            disabled={!canSend}
          >
            {submitting ? 'Sending...' : sendBackToEditor ? 'Send back' : 'Reject'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
