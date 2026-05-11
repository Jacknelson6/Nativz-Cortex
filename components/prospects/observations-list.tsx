'use client';

// SPY-03 T19a: observations list with inline-edit override.

import { useState } from 'react';
import { Pencil } from 'lucide-react';

interface Props {
  observations: string[];
  overrides?: { observations?: string[] };
  onEdit?: (idx: number, value: string) => void;
}

export function ObservationsList({ observations, overrides, onEdit }: Props) {
  const merged = overrides?.observations ?? observations;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  if (!merged || merged.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        No observations yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Observations</h3>
      <ul className="space-y-2">
        {merged.map((obs, i) => (
          <li key={i} className="group flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
            {editingIdx === i && onEdit ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  onEdit(i, draft);
                  setEditingIdx(null);
                }}
                autoFocus
                rows={2}
                className="flex-1 rounded-md border border-border bg-background p-1.5 text-sm"
              />
            ) : (
              <span className="flex-1">{obs}</span>
            )}
            {onEdit && editingIdx !== i && (
              <button
                type="button"
                onClick={() => {
                  setDraft(obs);
                  setEditingIdx(i);
                }}
                className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                aria-label={`Edit observation ${i + 1}`}
              >
                <Pencil size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
