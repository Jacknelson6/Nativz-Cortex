'use client';

/**
 * Turnaround acknowledgement screen (editing kind).
 *
 * Quiet expectations-setting before the client lands on "Done." We
 * call out the 5-7 business day first-cut SLA, the round-of-revisions
 * policy, and ask them to tick a box that says they read it. This is
 * the single biggest source of "wait, where is it?" support tickets,
 * so the ack is intentional.
 */

import { useState } from 'react';
import { Loader2, Clock, MessageSquare, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TurnaroundAckValue {
  acknowledged?: boolean;
  acknowledged_at?: string;
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

export function TurnaroundAckScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as TurnaroundAckValue | null) ?? {};
  const [checked, setChecked] = useState<boolean>(initial.acknowledged ?? false);

  const canSubmit = checked && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          How turnaround works
        </h1>
        <p className="text-base text-text-secondary">
          One quick read so we&apos;re on the same page about timelines.
        </p>
      </div>

      <ul className="space-y-3">
        <li className="flex gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="space-y-1">
            <div className="text-sm font-medium text-text-primary">First cut in 5 to 7 business days</div>
            <p className="text-sm text-text-secondary">
              Once your assets land, we send the first cut back inside one work week. Larger jobs may take a bit longer; we&apos;ll tell you if so.
            </p>
          </div>
        </li>
        <li className="flex gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-4">
          <MessageSquare size={18} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="space-y-1">
            <div className="text-sm font-medium text-text-primary">Two rounds of revisions</div>
            <p className="text-sm text-text-secondary">
              You get two rounds of notes per deliverable. Most projects only need one. After that we can keep iterating on a per-hour basis.
            </p>
          </div>
        </li>
        <li className="flex gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-4">
          <Mail size={18} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="space-y-1">
            <div className="text-sm font-medium text-text-primary">We email when it&apos;s ready</div>
            <p className="text-sm text-text-secondary">
              No need to chase. You&apos;ll get an email with a review link the moment your first cut is up.
            </p>
          </div>
        </li>
      </ul>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-3 hover:border-accent">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--accent)]"
        />
        <span className="text-sm text-text-primary">
          Got it. I understand the timeline.
        </span>
      </label>

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
            'Finish onboarding'
          )}
        </Button>
      </div>
    </form>
  );
}
