'use client';

// SPY-03 T14: profile picture assessment card.

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ProfilePicAssessment } from '@/lib/prospects/types';

interface Props {
  assessment: ProfilePicAssessment | null;
  overrides?: Partial<ProfilePicAssessment>;
  onOverride?: (patch: Partial<ProfilePicAssessment>) => void;
}

const RATING_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  okay: 'bg-amber-500',
  weak: 'bg-red-500',
};

export function ProfilePicCard({ assessment, overrides, onOverride }: Props) {
  const merged: ProfilePicAssessment | null = assessment
    ? { ...assessment, ...(overrides ?? {}) }
    : null;
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(merged?.note ?? '');

  if (!merged) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        Profile picture analysis pending.
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-4">
        <div className="size-[120px] shrink-0 overflow-hidden rounded-lg bg-background">
          {merged.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={merged.image_url} alt="Profile" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-text-muted">
              No image
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${RATING_DOT[merged.rating]}`} />
            <span className="text-sm font-medium capitalize text-foreground">{merged.rating}</span>
          </div>
          {editing && onOverride ? (
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                onOverride({ note: noteDraft });
                setEditing(false);
              }}
              autoFocus
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          ) : (
            <p className="text-sm text-text-muted">{merged.note}</p>
          )}
        </div>
      </div>
      {onOverride && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-3 top-3 rounded p-1 text-text-muted hover:bg-background hover:text-foreground"
          aria-label="Edit assessment"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}
