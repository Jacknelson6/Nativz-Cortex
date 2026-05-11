'use client';

// SPY-04 T19: 10-row strategist override panel. Each row shows the
// rule's computed score + note alongside an inline G/Y/R/NA pill picker
// and a free-text note field. Writes back via PATCH /api/prospects/[id]/analysis
// with `overrides.checklist_overrides.items[id] = { score?, note? }`.

import { useState } from 'react';
import type { ChecklistItem, ChecklistScore, ChecklistItemId } from '@/lib/prospects/checklist';
import type { ProspectAnalysisRow } from '@/lib/prospects/types';

const SCORE_PILLS: { value: ChecklistScore; label: string; className: string }[] = [
  { value: 'green', label: 'Green', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  { value: 'yellow', label: 'Yellow', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  { value: 'red', label: 'Red', className: 'bg-red-500/15 text-red-300 border-red-500/40' },
  { value: 'na', label: 'N/A', className: 'bg-surface text-text-muted border-border' },
];

interface Props {
  prospectId: string;
  analysis: ProspectAnalysisRow;
  items: ChecklistItem[];
}

interface OverrideMap {
  [id: string]: { score?: ChecklistScore; note?: string };
}

function pickInitialOverrides(analysis: ProspectAnalysisRow): OverrideMap {
  const o = (analysis.overrides ?? {}) as {
    checklist_overrides?: { items?: OverrideMap };
  };
  return o.checklist_overrides?.items ?? {};
}

export function ScorecardOverridesPanel({ prospectId, analysis, items }: Props) {
  const [overrides, setOverrides] = useState<OverrideMap>(() => pickInitialOverrides(analysis));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: OverrideMap, itemId: ChecklistItemId) {
    setSaving(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/analysis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: analysis.run_id,
          overrides: { checklist_overrides: { items: next } },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  function setScore(id: ChecklistItemId, score: ChecklistScore) {
    const next: OverrideMap = {
      ...overrides,
      [id]: { ...(overrides[id] ?? {}), score },
    };
    setOverrides(next);
    void persist(next, id);
  }

  function setNote(id: ChecklistItemId, note: string) {
    const next: OverrideMap = {
      ...overrides,
      [id]: { ...(overrides[id] ?? {}), note: note || undefined },
    };
    setOverrides(next);
    void persist(next, id);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-medium text-foreground">Strategist overrides</h3>
        <p className="mt-1 text-xs text-text-muted">
          Each rule is a deterministic pass. Set the colour you want clients to see and add a tailored note.
        </p>
      </header>
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/5 px-5 py-2 text-sm text-red-500">{error}</div>
      )}
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const ov = overrides[item.id] ?? {};
          const activeScore: ChecklistScore = ov.score ?? item.score;
          const noteValue = ov.note ?? item.note;
          return (
            <li key={item.id} className="space-y-2 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-text-muted">{item.description}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {SCORE_PILLS.map((p) => {
                    const active = p.value === activeScore;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setScore(item.id, p.value)}
                        disabled={saving === item.id}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                          active ? p.className : 'border-border bg-background text-text-muted hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea
                defaultValue={noteValue}
                onBlur={(e) => {
                  if (e.target.value !== noteValue) setNote(item.id, e.target.value);
                }}
                rows={2}
                placeholder="Strategist note for this row"
                className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-text-muted"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
