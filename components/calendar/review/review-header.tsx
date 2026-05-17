'use client';

/**
 * CUP-03 T03: header card for the SMM review surface. Shows brand + post
 * count + date range + state pill + the editor's most recent handoff note,
 * with a collapsible audit history under it.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HandoffHistoryEntry, HandoffState } from '@/lib/calendar/handoff-state';

interface ReviewHeaderProps {
  clientName: string;
  postCount: number;
  startDate: string | null;
  endDate: string | null;
  state: HandoffState;
  history: HandoffHistoryEntry[];
  actorNameById?: Record<string, string>;
}

const STATE_LABEL: Record<HandoffState, string> = {
  editing: 'In editing',
  smm_review: 'Awaiting your review',
  smm_approved: 'Approved',
  smm_rejected: 'Rejected, with editor',
  client_sent: 'Sent to client',
};

const STATE_PILL: Record<HandoffState, string> = {
  editing: 'bg-surface-hover text-text-secondary',
  smm_review: 'bg-amber-500/15 text-amber-300',
  smm_approved: 'bg-emerald-500/15 text-emerald-300',
  smm_rejected: 'bg-red-500/15 text-red-300',
  client_sent: 'bg-accent-surface text-accent-text',
};

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'Date range pending';
  if (start && end) return `${start} to ${end}`;
  return start ?? end ?? '';
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function latestEditorNote(history: HandoffHistoryEntry[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry.state === 'smm_review' && entry.note) return entry.note;
  }
  return null;
}

export function ReviewHeader({
  clientName,
  postCount,
  startDate,
  endDate,
  state,
  history,
  actorNameById,
}: ReviewHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);
  const note = latestEditorNote(history);
  const rangeLabel = fmtRange(startDate, endDate);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-text-primary">{clientName}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {postCount} post{postCount === 1 ? '' : 's'}, {rangeLabel}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_PILL[state]}`}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {note && (
        <div className="mt-4 rounded-lg border border-nativz-border bg-background/40 p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Editor note</p>
          <p className="mt-1 text-sm leading-snug text-text-secondary">{note}</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showHistory ? 'Hide' : 'Show'} history ({history.length})
          </button>
          {showHistory && (
            <ol className="mt-2 space-y-2 border-l border-nativz-border pl-3">
              {history.map((entry, i) => {
                const actor = actorNameById?.[entry.actor] ?? entry.actor;
                return (
                  <li key={`${entry.at}-${i}`} className="text-xs text-text-muted">
                    <div>
                      <span className="text-text-secondary">{STATE_LABEL[entry.state]}</span>
                      {' by '}
                      <span className="text-text-secondary">{actor}</span>
                      {' at '}
                      <span>{fmtTimestamp(entry.at)}</span>
                    </div>
                    {entry.note && (
                      <p className="mt-1 text-text-muted/80 italic">{entry.note}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
