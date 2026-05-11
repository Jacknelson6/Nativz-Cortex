'use client';

// SPY-04 T20: generate + copy share URL. State machine idle → generating
// → done → error. Copies the public URL to clipboard on success. Calls
// router.refresh() so the share-link list rehydrates with the new row.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';

interface Props {
  prospectId: string;
  disabled?: boolean;
}

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'done'; url: string; copied: boolean }
  | { kind: 'error'; message: string };

export function GenerateScorecardButton({ prospectId, disabled }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'generating' });
    try {
      const res = await fetch(`/api/prospects/${prospectId}/scorecard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'error', message: json.error ?? `HTTP ${res.status}` });
        return;
      }
      const url: string = json.public_url;
      try {
        await navigator.clipboard.writeText(url);
        setState({ kind: 'done', url, copied: true });
      } catch {
        setState({ kind: 'done', url, copied: false });
      }
      router.refresh();
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async function copyAgain() {
    if (state.kind !== 'done') return;
    try {
      await navigator.clipboard.writeText(state.url);
      setState({ ...state, copied: true });
    } catch {
      // noop
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled || state.kind === 'generating'}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {state.kind === 'generating' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Share2 size={14} />
        )}
        Generate scorecard
      </button>
      {state.kind === 'done' && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
          <span className="flex-1 truncate text-text-muted">{state.url}</span>
          <button
            type="button"
            onClick={copyAgain}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-foreground hover:bg-surface"
          >
            {state.copied ? <Check size={12} /> : <Copy size={12} />}
            {state.copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          {state.message}
        </div>
      )}
    </div>
  );
}
