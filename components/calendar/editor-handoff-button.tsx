'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, RotateCw, Send, XCircle } from 'lucide-react';
import type { HandoffState } from '@/lib/calendar/handoff-state';

interface Props {
  dropId: string;
  state: HandoffState;
  rejectionNote?: string;
}

/**
 * Editor's "I'm done" CTA + SMM-state pill for the drop detail header.
 * Renders one of five layouts per CUP-01 PRD.
 */
export function EditorHandoffButton({ dropId, state, rejectionNote }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticState, setOptimisticState] = useState<HandoffState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = optimisticState ?? state;

  async function callHandoff(path: string) {
    setError(null);
    try {
      const res = await fetch(`/api/calendar/drops/${dropId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.hint ?? body.error ?? `Request failed (${res.status})`);
        setOptimisticState(null);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setOptimisticState(null);
    }
  }

  function handoff() {
    setOptimisticState('smm_review');
    callHandoff('handoff');
  }

  const busy = pending || optimisticState !== null;

  if (current === 'editing') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={handoff}
          disabled={busy}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Hand off to SMM
        </button>
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
    );
  }

  if (current === 'smm_review') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm text-text-secondary">
          <Clock size={14} />
          Waiting on SMM review
        </span>
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
    );
  }

  if (current === 'smm_approved') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        <CheckCircle2 size={14} />
        Approved by SMM
      </span>
    );
  }

  if (current === 'client_sent') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        <Send size={14} />
        Sent to client
      </span>
    );
  }

  // smm_rejected: red-tinted card with the rejection note + a Re-submit CTA.
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-red-300">
        <XCircle size={14} />
        SMM requested changes
      </div>
      {rejectionNote ? (
        <p className="text-xs leading-relaxed text-text-secondary">{rejectionNote}</p>
      ) : null}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handoff}
          disabled={busy}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
          Re-submit for review
        </button>
      </div>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
