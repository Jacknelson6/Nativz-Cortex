'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterChipProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function FilterChip({ label, value, options, onChange }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || label;
  const isDefault = value === options[0]?.value;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
          isDefault
            ? 'border-nativz-border bg-surface text-text-secondary hover:border-text-muted'
            : 'border-accent/40 bg-accent-surface text-accent-text'
        }`}
      >
        {isDefault ? label : selectedLabel}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`animate-stagger-in block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                opt.value === value
                  ? 'bg-accent-surface text-accent-text font-medium'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
              style={{ animationDelay: `${i * 20}ms` }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
