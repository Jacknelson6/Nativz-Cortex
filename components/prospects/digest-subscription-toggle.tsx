'use client';

// SPY-10 T23: per-prospect subscription toggle for the two digest kinds.
// Renders two switches (weekly competitor + monthly format). Optimistic
// state with rollback on failure so toggling feels instant.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DigestKind } from '@/lib/prospects/types';

interface SubscriptionState {
  weekly_competitor: boolean;
  monthly_format: boolean;
}

interface Props {
  prospectId: string;
  initial: SubscriptionState;
}

const LABELS: Record<DigestKind, { title: string; sub: string }> = {
  weekly_competitor: {
    title: 'Weekly competitor digest',
    sub: 'Top 3 competitor moves from the last 7 days.',
  },
  monthly_format: {
    title: 'Monthly format digest',
    sub: 'Five trending formats with sample posts and the why.',
  },
};

export function DigestSubscriptionToggle({ prospectId, initial }: Props) {
  const [state, setState] = useState<SubscriptionState>(initial);
  const [pending, setPending] = useState<DigestKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(kind: DigestKind) {
    const next = !state[kind];
    setState((s) => ({ ...s, [kind]: next }));
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/digest/subscribe`, {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      setState((s) => ({ ...s, [kind]: !next }));
      setError(err instanceof Error ? err.message : 'toggle failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {(Object.keys(LABELS) as DigestKind[]).map((kind) => {
        const on = state[kind];
        const busy = pending === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={busy}
            onClick={() => toggle(kind)}
            className="w-full flex items-start justify-between rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition px-4 py-3 text-left disabled:opacity-60"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{LABELS[kind].title}</div>
              <div className="text-xs text-white/60 mt-0.5">{LABELS[kind].sub}</div>
            </div>
            <div className="shrink-0 flex items-center gap-2 ml-4">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
              <div
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                  on ? 'bg-blue-500' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    on ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>
          </button>
        );
      })}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
