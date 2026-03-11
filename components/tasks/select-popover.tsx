'use client';

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

// ─── Positioning helper ──────────────────────────────────────────────────

function calcPosition(
  anchor: HTMLElement,
  popWidth: number,
  popHeight: number,
): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect();
  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));

  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow < popHeight && rect.top > spaceBelow
      ? rect.top - popHeight - 4
      : rect.bottom + 4;

  return { top, left };
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

interface SelectPopoverProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  searchable?: boolean;
  width?: number;
}

// ─── Component ───────────────────────────────────────────────────────────

export function SelectPopover({
  options,
  value,
  onChange,
  onClose,
  anchorRef,
  searchable = false,
  width = 220,
}: SelectPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState('');

  // Calculate position synchronously before paint
  useLayoutEffect(() => {
    if (anchorRef.current) {
      setPos(calcPosition(anchorRef.current, width, Math.min(options.length * 36 + (searchable ? 44 : 16), 320)));
    }
  }, [anchorRef, width, options.length, searchable]);

  // Focus search on mount
  useEffect(() => {
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
  }, [searchable]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  if (!pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 150 }}
      className="bg-surface/80 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      {searchable && (
        <div className="px-2 pt-2 pb-1">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder-text-muted/50 outline-none border border-white/[0.08] focus:border-accent/40 transition-colors"
          />
        </div>
      )}
      <div className="py-1 max-h-[280px] overflow-y-auto">
        {filtered.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                onClose();
              }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors cursor-pointer ${
                isSelected ? 'bg-white/[0.08] text-text-primary' : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
              }`}
            >
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <span className="flex-1 text-left truncate">{option.label}</span>
              {option.hint && <span className="text-[10px] text-text-muted shrink-0">{option.hint}</span>}
              {isSelected && <Check size={14} className="text-accent-text shrink-0" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-text-muted">No results</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Trigger wrapper (for inline use) ────────────────────────────────────

interface SelectTriggerProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  label?: string;
  placeholder?: string;
  searchable?: boolean;
  width?: number;
  className?: string;
}

export function SelectTrigger({
  options,
  value,
  onChange,
  icon,
  label,
  placeholder = 'Select...',
  searchable,
  width,
  className = '',
}: SelectTriggerProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${className}`}
      >
        {icon}
        <span className="max-w-[80px] truncate">{selected?.label ?? placeholder}</span>
        {label && <span className="text-xs text-text-muted">{label}</span>}
      </button>
      {open && (
        <SelectPopover
          anchorRef={btnRef}
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          searchable={searchable}
          width={width}
        />
      )}
    </>
  );
}
