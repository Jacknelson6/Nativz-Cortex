'use client';

// ZNA-02: segmented range control. Stays uncontrolled URL-side by default;
// parent owns the active value via prop and decides what to do on change
// (typically: update searchParams + refetch).

import type { RangeKey } from '@/lib/analytics/types';

interface Props {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}

const OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All' },
];

export function ZernioRangeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex border border-white/10 rounded-full overflow-hidden">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`whitespace-nowrap px-3 py-1 text-xs transition ${
              active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
