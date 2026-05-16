'use client';

import type { HandoffState } from '@/lib/calendar/handoff-state';

export type DropListSmmFilterValue = 'all' | HandoffState;

interface Option {
  value: DropListSmmFilterValue;
  label: string;
}

const OPTIONS: Option[] = [
  { value: 'all', label: 'All' },
  { value: 'smm_review', label: 'Awaiting SMM' },
  { value: 'smm_approved', label: 'Approved' },
  { value: 'client_sent', label: 'Sent' },
];

interface Props {
  value: DropListSmmFilterValue;
  onChange: (next: DropListSmmFilterValue) => void;
}

/**
 * Pill row that filters the drop list by handoff_state. "All" clears the
 * filter; the others map directly onto the enum so the parent can pass the
 * value straight into the query (or a URL search param) without translation.
 */
export function DropListSmmFilter({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter drops by SMM review state"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-nativz-border bg-surface p-1"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex cursor-pointer items-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-accent/15 text-accent-text'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
