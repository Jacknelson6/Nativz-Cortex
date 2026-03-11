'use client';

import { useState, useEffect } from 'react';
import { Building2, User } from 'lucide-react';

export interface MentionOption {
  type: 'client' | 'team_member';
  id: string;
  name: string;
  slug?: string;
  agency?: string;
  role?: string;
  avatarUrl?: string | null;
}

export function MentionAutocomplete({
  query,
  options,
  onSelect,
}: {
  query: string;
  options: MentionOption[];
  onSelect: (option: MentionOption) => void;
}) {
  const filtered = options
    .filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 z-50 mb-2 w-64 max-h-64 overflow-y-auto rounded-xl border border-nativz-border bg-surface shadow-elevated animate-[popIn_150ms_ease-out_forwards]">
      {filtered.map((option, idx) => (
        <button
          key={`${option.type}-${option.id}`}
          onClick={() => onSelect(option)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer ${
            idx === selectedIndex ? 'bg-accent-surface text-text-primary' : 'text-text-secondary hover:bg-surface-hover'
          } ${idx === 0 ? 'rounded-t-xl' : ''} ${idx === filtered.length - 1 ? 'rounded-b-xl' : ''}`}
        >
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            option.type === 'client' ? 'bg-blue-500/15' : 'bg-purple-500/15'
          }`}>
            {option.type === 'client' ? (
              <Building2 size={13} className="text-blue-400" />
            ) : (
              <User size={13} className="text-purple-400" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate font-medium">{option.name}</div>
            <div className="truncate text-[10px] text-text-muted">
              {option.type === 'client' ? (option.agency ?? 'Client') : (option.role ?? 'Team member')}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
