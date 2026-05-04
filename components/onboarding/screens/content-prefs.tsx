'use client';

/**
 * Content preferences screen.
 *
 * Cadence (posts per week), 3-5 content pillars, and a "do not" list
 * for things that are off-limits (competitors, sensitive topics, dead
 * products, etc). The pillars are stored as an array of trimmed strings;
 * cadence is a small int.
 */

import { useState, KeyboardEvent } from 'react';
import { Loader2, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

interface ContentPrefsValue {
  cadence_per_week?: number;
  pillars?: string[];
  avoid?: string;
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

const CADENCE_OPTIONS = [1, 2, 3, 4, 5, 7];

export function ContentPrefsScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as ContentPrefsValue | null) ?? {};
  const [cadence, setCadence] = useState<number>(initial.cadence_per_week ?? 3);
  const [pillars, setPillars] = useState<string[]>(initial.pillars ?? []);
  const [pillarDraft, setPillarDraft] = useState('');
  const [avoid, setAvoid] = useState(initial.avoid ?? '');

  function addPillar() {
    const v = pillarDraft.trim();
    if (!v) return;
    if (pillars.includes(v)) {
      setPillarDraft('');
      return;
    }
    if (pillars.length >= 6) return;
    setPillars((prev) => [...prev, v]);
    setPillarDraft('');
  }

  function onPillarKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addPillar();
    }
  }

  function removePillar(p: string) {
    setPillars((prev) => prev.filter((x) => x !== p));
  }

  const canSubmit = pillars.length >= 1 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          cadence_per_week: cadence,
          pillars,
          avoid: avoid.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Content preferences
        </h1>
        <p className="text-base text-text-secondary">
          How often to post, what topics to cover, what to steer clear of.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Posts per week</label>
        <div className="flex flex-wrap gap-2">
          {CADENCE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCadence(n)}
              disabled={submitting}
              className={
                cadence === n
                  ? 'rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent-text'
                  : 'rounded-full border border-nativz-border bg-surface px-4 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-text-primary'
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">
          Content pillars (3-5 topics we&apos;ll keep coming back to)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={pillarDraft}
            onChange={(e) => setPillarDraft(e.target.value)}
            onKeyDown={onPillarKey}
            disabled={submitting}
            placeholder="e.g. behind the scenes, founder POV, product education"
            className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button type="button" variant="secondary" onClick={addPillar} disabled={submitting || !pillarDraft.trim()}>
            <Plus size={14} />
            Add
          </Button>
        </div>
        {pillars.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {pillars.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-sm text-accent-text"
              >
                {p}
                <button
                  type="button"
                  onClick={() => removePillar(p)}
                  disabled={submitting}
                  className="opacity-70 hover:opacity-100"
                  aria-label={`Remove ${p}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Textarea
        id="avoid"
        label="Anything to avoid? (optional)"
        placeholder="Competitors, sensitive topics, retired products, anything off-limits."
        value={avoid}
        onChange={(e) => setAvoid(e.target.value)}
        rows={3}
        maxLength={500}
        disabled={submitting}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
