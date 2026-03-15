'use client';

import { useState, useRef, useEffect } from 'react';
import { User, Search, ChevronDown } from 'lucide-react';
import { EDITING_STATUSES, PipelineItem } from './pipeline-types';

// ─── PipelineFilters ──────────────────────────────────────────────────────────

interface PipelineFiltersProps {
  myClientsOnly: boolean;
  onMyClientsToggle: (v: boolean) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  agencyFilter: string;
  onAgencyFilter: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  isOwner: boolean;
}

function Dropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const isActive = !!value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`
          flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium border
          transition-colors cursor-pointer whitespace-nowrap
          ${isActive
            ? 'bg-accent/10 border-accent/40 text-accent-text'
            : 'bg-surface border-nativz-border text-text-muted hover:text-text-primary hover:border-nativz-border/80'
          }
        `}
      >
        {selected ? selected.label : placeholder}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-dropdown py-1 min-w-[160px]">
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-surface-hover ${
                !value ? 'text-text-primary font-medium' : 'text-text-muted'
              }`}
            >
              {placeholder}
            </button>
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-surface-hover ${
                  opt.value === value ? 'text-text-primary font-medium' : 'text-text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_OPTIONS = EDITING_STATUSES.map(s => ({ value: s.value, label: s.label }));

const AGENCY_OPTIONS = [
  { value: 'Nativz', label: 'Nativz' },
  { value: 'AC', label: 'AC' },
];

export function PipelineFilters({
  myClientsOnly,
  onMyClientsToggle,
  statusFilter,
  onStatusFilter,
  agencyFilter,
  onAgencyFilter,
  search,
  onSearch,
}: PipelineFiltersProps) {
  return (
    <div className="px-6 py-2 border-b border-nativz-border bg-background flex items-center gap-2 flex-wrap">
      {/* My clients toggle */}
      <button
        onClick={() => onMyClientsToggle(!myClientsOnly)}
        className={`
          flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium border
          transition-colors cursor-pointer whitespace-nowrap
          ${myClientsOnly
            ? 'bg-accent/10 border-accent/40 text-accent-text'
            : 'bg-surface border-nativz-border text-text-muted hover:text-text-primary hover:border-nativz-border/80'
          }
        `}
      >
        <User className="w-3 h-3" />
        My clients
      </button>

      {/* Status filter */}
      <Dropdown
        value={statusFilter}
        onChange={onStatusFilter}
        options={STATUS_OPTIONS}
        placeholder="All statuses"
      />

      {/* Agency filter */}
      <Dropdown
        value={agencyFilter}
        onChange={onAgencyFilter}
        options={AGENCY_OPTIONS}
        placeholder="All agencies"
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search clients..."
          className="h-7 pl-7 pr-3 rounded-full text-xs bg-surface border border-nativz-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors w-44"
        />
      </div>
    </div>
  );
}

// ─── PipelineSummary ──────────────────────────────────────────────────────────

interface PipelineSummaryProps {
  items: PipelineItem[];
  statusFilter: string;
  onStatusFilter: (v: string) => void;
}

export function PipelineSummary({ items, statusFilter, onStatusFilter }: PipelineSummaryProps) {
  // Count items per editing_status
  const counts = EDITING_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s.value] = items.filter(item => item.editing_status === s.value).length;
    return acc;
  }, {});

  const total = items.length;
  const complete = items.filter(item =>
    item.editing_status === 'done' || item.editing_status === 'scheduled'
  ).length;

  const visibleStatuses = EDITING_STATUSES.filter(s => counts[s.value] > 0);

  return (
    <div className="px-6 py-2 border-b border-nativz-border bg-background flex items-center gap-2 overflow-x-auto">
      {visibleStatuses.map(s => {
        const isActive = statusFilter === s.value;
        return (
          <button
            key={s.value}
            onClick={() => onStatusFilter(isActive ? '' : s.value)}
            className={`
              flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium border
              transition-all cursor-pointer whitespace-nowrap shrink-0
              ${s.color}
              ${isActive ? 'ring-2 ring-offset-1 ring-offset-background ring-current' : 'opacity-80 hover:opacity-100'}
            `}
          >
            {s.label}
            <span className="font-semibold tabular-nums">{counts[s.value]}</span>
          </button>
        );
      })}

      {visibleStatuses.length > 0 && (
        <div className="w-px h-4 bg-nativz-border shrink-0" />
      )}

      <span className="text-xs text-text-muted whitespace-nowrap shrink-0 tabular-nums">
        {complete}/{total} complete
      </span>
    </div>
  );
}
