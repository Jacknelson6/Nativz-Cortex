'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import type { MoodboardTag } from '@/lib/types/moodboard';

const PLATFORMS = ['all', 'tiktok', 'instagram', 'youtube', 'twitter'] as const;
const STATUSES = ['all', 'completed', 'processing', 'failed'] as const;

const PLATFORM_LABELS: Record<string, string> = {
  all: 'All',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: '𝕏',
};

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  completed: 'Completed',
  processing: 'Processing',
  failed: 'Failed',
};

export interface MoodboardFilters {
  platform: string;
  status: string;
  tagIds: string[];
  searchQuery: string;
}

interface FilterBarProps {
  boardId: string;
  boardTags: MoodboardTag[];
  filters: MoodboardFilters;
  onFiltersChange: (filters: MoodboardFilters) => void;
}

export function FilterBar({ boardTags, filters, onFiltersChange }: FilterBarProps) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState(filters.searchQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagDropdownOpen(false);
    }
    if (tagDropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tagDropdownOpen]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onFiltersChange({ ...filters, searchQuery: value });
    }, 300);
  }

  const hasActiveFilters = filters.platform !== 'all' || filters.status !== 'all' || filters.tagIds.length > 0 || filters.searchQuery !== '';

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-nativz-border bg-surface/60 backdrop-blur-sm overflow-x-auto">
      {/* Platform filter */}
      <div className="flex items-center gap-0.5 rounded-lg border border-nativz-border p-0.5">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => onFiltersChange({ ...filters, platform: p })}
            className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              filters.platform === p
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
            }`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-0.5 rounded-lg border border-nativz-border p-0.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onFiltersChange({ ...filters, status: s })}
            className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              filters.status === s
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {boardTags.length > 0 && (
        <div className="relative" ref={tagRef}>
          <button
            onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
            className={`cursor-pointer flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              filters.tagIds.length > 0
                ? 'border-accent bg-accent/10 text-accent-text'
                : 'border-nativz-border text-text-muted hover:bg-surface-hover'
            }`}
          >
            Tags {filters.tagIds.length > 0 && `(${filters.tagIds.length})`}
            <ChevronDown size={10} />
          </button>

          {tagDropdownOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
              {boardTags.map((tag) => {
                const selected = filters.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      const newIds = selected
                        ? filters.tagIds.filter((id) => id !== tag.id)
                        : [...filters.tagIds, tag.id];
                      onFiltersChange({ ...filters, tagIds: newIds });
                    }}
                    className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {selected && <Check size={12} className="text-accent-text shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative flex-1 min-w-[140px] max-w-[260px]">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search items..."
          className="w-full rounded-lg border border-nativz-border bg-surface pl-7 pr-7 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); onFiltersChange({ ...filters, searchQuery: '' }); }}
            className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={() => {
            setSearchInput('');
            onFiltersChange({ platform: 'all', status: 'all', tagIds: [], searchQuery: '' });
          }}
          className="cursor-pointer text-[10px] font-medium text-accent-text hover:underline shrink-0"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
