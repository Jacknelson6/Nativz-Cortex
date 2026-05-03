'use client';

/**
 * Kickoff pick screen.
 *
 * Client picks a date + time for their kickoff call. We don't enforce
 * team availability here in the public stepper, that gates server-side
 * once we wire calendar API; for now we collect their first-choice
 * slot and a couple of optional alternates so the AM has something to
 * counter-propose against.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';

interface KickoffPickValue {
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

function defaultNextWorkday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export function KickoffPickScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as KickoffPickValue | null) ?? {};
  const [date, setDate] = useState(initial.preferred_date ?? defaultNextWorkday());
  const [time, setTime] = useState(initial.preferred_time ?? '10:00');
  const [notes, setNotes] = useState(initial.notes ?? '');

  const canSubmit = date.length > 0 && time.length > 0 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          preferred_date: date,
          preferred_time: time,
          notes: notes.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">Pick a kickoff time</h1>
        <p className="text-base text-text-secondary">
          A 30-minute call to align on goals and walk through the first month. We&apos;ll confirm by email.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Preferred slot</label>
        <DateTimePicker date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
        <p className="text-xs text-text-muted">Times are in your local timezone.</p>
      </div>

      <Textarea
        id="kickoff_notes"
        label="Anything we should know before the call? (optional)"
        placeholder="Other people who should be on the call, time-sensitive launches, etc."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        maxLength={500}
        disabled={submitting}
      />

      <div className="flex items-center justify-end">
        <Button type="submit" size="lg" disabled={!canSubmit}>
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
