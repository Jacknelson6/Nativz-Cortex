'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

interface ComboSelectOption {
  value: string;
  label: string;
}

interface ComboSelectProps {
  label?: string;
  options: ComboSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
}

export function ComboSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = true,
}: ComboSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Filter options by search
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Focus search input when opening
  useEffect(() => {
    if (open && searchable) {
      // Small delay so the dropdown renders first
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    if (!open) setSearch('');
  }, [open, searchable]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      {label && (
        <span className="block text-sm font-medium text-text-secondary">{label}</span>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_rgba(4,107,210,0.15)] cursor-pointer"
      >
        <span className={selected ? '' : 'text-text-muted'}>{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden animate-fade-slide-in">
          {/* Search */}
          {searchable && options.length > 6 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-nativz-border/50">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none"
              />
            </div>
          )}

          {/* Options list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1 overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-muted text-center">No results</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'text-accent-text bg-accent-surface/10'
                        : 'text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <span className="w-4 shrink-0 flex items-center justify-center">
                      {isSelected && <Check size={14} className="text-accent-text" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

    </div>
  );
}
