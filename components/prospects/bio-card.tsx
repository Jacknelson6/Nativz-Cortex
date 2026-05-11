'use client';

// SPY-03 T15: bio assessment card. Hook + CTA + rating + note.

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { BioAssessment } from '@/lib/prospects/types';

interface Props {
  assessment: BioAssessment | null;
  overrides?: Partial<BioAssessment>;
  onOverride?: (patch: Partial<BioAssessment>) => void;
}

const RATING_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  okay: 'bg-amber-500',
  weak: 'bg-red-500',
};

export function BioCard({ assessment, overrides, onOverride }: Props) {
  const merged = assessment ? { ...assessment, ...(overrides ?? {}) } : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(merged?.note ?? '');

  if (!merged) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        Bio analysis pending.
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${RATING_DOT[merged.rating]}`} />
          <h3 className="text-sm font-medium text-foreground">Bio</h3>
        </div>
        {onOverride && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1 text-text-muted hover:bg-background hover:text-foreground"
            aria-label="Edit bio assessment"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Hook</dt>
          <dd className="text-foreground">{merged.hook || <span className="text-text-muted">None detected</span>}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">CTA</dt>
          <dd className="text-foreground">{merged.cta || <span className="text-text-muted">None detected</span>}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Note</dt>
          {editing && onOverride ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onOverride({ note: draft });
                setEditing(false);
              }}
              autoFocus
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          ) : (
            <dd className="text-text-muted">{merged.note}</dd>
          )}
        </div>
      </dl>
    </div>
  );
}
