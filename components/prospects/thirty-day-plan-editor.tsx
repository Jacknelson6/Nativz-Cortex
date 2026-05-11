// SPY-09 T19: admin-side editor for the 3 plan items. Lives on the
// prospect detail page (Analysis tab). Two CTAs: Regenerate (LLM draft
// from scratch) and Save (writes strategist-edited copy). The
// "strategist edited" badge appears once Save lands.

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ThirtyDayPlan, ThirtyDayPlanItem } from '@/lib/prospects/types';

interface Props {
  prospectId: string;
  initialPlan: ThirtyDayPlan | null;
}

const EMPTY_ITEMS: ThirtyDayPlanItem[] = [
  { id: 'action_01', title: '', body: '', rationale: '' },
  { id: 'action_02', title: '', body: '', rationale: '' },
  { id: 'action_03', title: '', body: '', rationale: '' },
];

export function ThirtyDayPlanEditor({ prospectId, initialPlan }: Props) {
  const [plan, setPlan] = useState<ThirtyDayPlan>(
    initialPlan ?? {
      generated_at: new Date().toISOString(),
      items: EMPTY_ITEMS,
      strategist_edited: false,
    },
  );
  const [busy, setBusy] = useState<'regen' | 'save' | null>(null);

  function patchItem(idx: number, patch: Partial<ThirtyDayPlanItem>) {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  async function regenerate() {
    setBusy('regen');
    try {
      const res = await fetch(`/api/prospects/${prospectId}/present/draft-plan`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => ({}))) as { plan?: ThirtyDayPlan; error?: string };
      if (!res.ok || !body.plan) {
        toast.error(body.error ?? 'Failed to draft plan');
        return;
      }
      setPlan(body.plan);
      toast.success('Drafted a fresh 30-day plan.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    try {
      const res = await fetch(`/api/prospects/${prospectId}/present/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: plan.items }),
      });
      const body = (await res.json().catch(() => ({}))) as { plan?: ThirtyDayPlan; error?: string };
      if (!res.ok || !body.plan) {
        toast.error(body.error ?? 'Failed to save plan');
        return;
      }
      setPlan(body.plan);
      toast.success('Plan saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const hasContent = plan.items.some((i) => i.title.trim().length > 0);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">30-day plan</h3>
          <p className="mt-1 text-xs text-text-muted">
            Drafted by Sonnet 4.5 from the scorecard. Edit the copy before minting the presentation link.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan.strategist_edited ? (
            <span className="rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              Strategist edited
            </span>
          ) : hasContent ? (
            <span className="rounded-full border border-amber-700/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
              LLM draft
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {plan.items.map((item, idx) => (
          <div key={item.id} className="rounded-lg border border-nativz-border/60 bg-surface-hover p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
              Action {String(idx + 1).padStart(2, '0')}
            </div>
            <input
              value={item.title}
              maxLength={80}
              placeholder="Action title (sentence case, no em dashes)"
              onChange={(e) => patchItem(idx, { title: e.target.value })}
              className="mt-2 w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <textarea
              value={item.body}
              maxLength={240}
              rows={2}
              placeholder="What to do this month, concrete steps."
              onChange={(e) => patchItem(idx, { body: e.target.value })}
              className="mt-2 w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <textarea
              value={item.rationale}
              maxLength={200}
              rows={2}
              placeholder="Why this matters, connect to a checklist item."
              onChange={(e) => patchItem(idx, { rationale: e.target.value })}
              className="mt-2 w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-xs text-text-secondary outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={regenerate}
          disabled={busy !== null}
          className="rounded-md border border-nativz-border bg-surface-hover px-3 py-1.5 text-xs text-text-secondary hover:bg-surface disabled:opacity-50"
        >
          {busy === 'regen' ? 'Regenerating…' : 'Regenerate with AI'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy !== null || !hasContent}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          {busy === 'save' ? 'Saving…' : 'Save plan'}
        </button>
      </div>
    </div>
  );
}
