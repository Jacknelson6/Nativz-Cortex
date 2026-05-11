'use client';

// SPY-03 T19b: biggest-opportunity card with inline strategist override.

import { useState } from 'react';
import { Pencil, Sparkles } from 'lucide-react';

interface Props {
  opportunity: string | null;
  override?: string;
  onOverride?: (value: string) => void;
}

export function BiggestOpportunityCard({ opportunity, override, onOverride }: Props) {
  const value = override ?? opportunity ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!value) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        No opportunity surfaced.
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-accent/40 bg-accent/5 p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={16} className="text-accent" />
        <h3 className="text-sm font-medium accent-text">Biggest opportunity</h3>
      </div>
      {editing && onOverride ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onOverride(draft);
            setEditing(false);
          }}
          autoFocus
          rows={4}
          className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
        />
      ) : (
        <p className="text-base font-medium leading-relaxed text-foreground">{value}</p>
      )}
      {onOverride && !editing && (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="absolute right-3 top-3 rounded p-1 text-text-muted hover:bg-surface hover:text-foreground"
          aria-label="Edit opportunity"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}
