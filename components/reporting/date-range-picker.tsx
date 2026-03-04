'use client';

import type { DateRangePreset } from '@/lib/types/reporting';

const presets: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
];

interface DateRangePickerProps {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
      {presets.map((preset) => {
        const isActive = value === preset.value;
        return (
          <button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
