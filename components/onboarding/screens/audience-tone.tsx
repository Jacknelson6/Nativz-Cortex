'use client';

/**
 * Audience and tone screen.
 *
 * Persona snapshot + tone descriptors. We let them pick from a small
 * preset of tone words and also write a short free-form persona note.
 * The presets are biased toward how the strategy team thinks about
 * voice (energy + register), not generic "playful / serious".
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

interface AudienceToneValue {
  persona?: string;
  tones?: string[];
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

const TONE_OPTIONS = [
  'confident',
  'warm',
  'witty',
  'punchy',
  'authoritative',
  'irreverent',
  'educational',
  'aspirational',
  'no-nonsense',
  'playful',
  'premium',
  'down-to-earth',
];

export function AudienceToneScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as AudienceToneValue | null) ?? {};
  const [persona, setPersona] = useState(initial.persona ?? '');
  const [tones, setTones] = useState<string[]>(initial.tones ?? []);

  function toggleTone(t: string) {
    setTones((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 4) return prev;
      return [...prev, t];
    });
  }

  const canSubmit = persona.trim().length > 0 && tones.length > 0 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          persona: persona.trim(),
          tones,
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Audience and tone
        </h1>
        <p className="text-base text-text-secondary">
          Picture one person who is the perfect customer. What&apos;s their day look like?
        </p>
      </div>

      <Textarea
        id="persona"
        label="Sketch your ideal viewer"
        placeholder="A 32-year-old marketing manager in Brooklyn, scrolls TikTok on her commute, follows three competitors..."
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        rows={5}
        maxLength={800}
        disabled={submitting}
      />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">
          Pick up to 4 tone descriptors
        </label>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((t) => {
            const active = tones.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTone(t)}
                disabled={submitting || (!active && tones.length >= 4)}
                className={
                  active
                    ? 'rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent-text'
                    : 'rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-text-primary disabled:opacity-40'
                }
              >
                {t}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-text-muted">{tones.length} of 4 selected</p>
      </div>

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
