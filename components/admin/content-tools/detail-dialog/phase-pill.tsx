/**
 * Phase pill rendered next to the project title in the review table and
 * inside the slide-over header. The tone palette mirrors PHASE_TONE in
 * `lib/editing/types.ts`; both files reference the same canonical
 * "slate / amber / blue / emerald / neutral" lookup so the rest of the
 * UI only sees one stable shape.
 */

import { PHASE_TONE, type EditingProjectPhase } from '@/lib/editing/types';

const TONE_CLASS: Record<typeof PHASE_TONE[EditingProjectPhase], string> = {
  slate: 'border-nativz-border bg-surface text-text-secondary',
  amber:
    'border-status-warning/40 bg-status-warning/10 text-status-warning',
  blue: 'border-accent/40 bg-accent-surface/40 text-accent-text',
  emerald:
    'border-status-success/40 bg-status-success/10 text-status-success',
  neutral: 'border-nativz-border bg-background text-text-muted',
};

export function PhasePill({
  phase,
  size = 'sm',
}: {
  phase: EditingProjectPhase | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!phase) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-nativz-border bg-background px-2 py-0.5 text-[11px] text-text-muted">
        No phase
      </span>
    );
  }
  const tone = PHASE_TONE[phase] ?? 'neutral';
  const sizing =
    size === 'md'
      ? 'px-2.5 py-1 text-[12px]'
      : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizing} font-medium ${TONE_CLASS[tone]}`}
    >
      {phase}
    </span>
  );
}
