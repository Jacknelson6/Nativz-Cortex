'use client';

import { useState } from 'react';
import { Search, Plus, Globe, Sparkles, Loader2 } from 'lucide-react';

const ALL_TYPES = [
  'brand_profile',
  'brand_asset',
  'web_page',
  'note',
  'document',
  'contact',
  'search',
  'strategy',
  'idea',
  'idea_submission',
] as const;

const TYPE_LABELS: Record<string, string> = {
  brand_profile: 'Brand profile',
  brand_asset: 'Brand asset',
  web_page: 'Web page',
  note: 'Note',
  document: 'Document',
  contact: 'Contact',
  search: 'Search',
  strategy: 'Strategy',
  idea: 'Idea',
  idea_submission: 'Idea submission',
};

interface KnowledgeToolbarProps {
  clientId: string;
  typeFilters: Set<string>;
  onTypeFiltersChange: (filters: Set<string>) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function KnowledgeToolbar({
  clientId,
  typeFilters,
  onTypeFiltersChange,
  searchQuery,
  onSearchChange,
}: KnowledgeToolbarProps) {
  const [scraping, setScraping] = useState(false);
  const [generating, setGenerating] = useState(false);

  function toggleType(type: string) {
    const next = new Set(typeFilters);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onTypeFiltersChange(next);
  }

  async function handleScrape() {
    setScraping(true);
    try {
      await fetch(`/api/clients/${clientId}/knowledge/scrape`, { method: 'POST' });
    } catch (err) {
      console.error('Scrape failed:', err);
    } finally {
      setScraping(false);
    }
  }

  async function handleGenerateBrandProfile() {
    setGenerating(true);
    try {
      await fetch(`/api/clients/${clientId}/knowledge/brand-profile`, { method: 'POST' });
    } catch (err) {
      console.error('Brand profile generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-48 rounded-md border border-nativz-border bg-background pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
        />
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap items-center gap-1">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              typeFilters.has(type)
                ? 'bg-accent-surface text-accent-text'
                : 'bg-surface-hover text-text-muted hover:text-text-secondary'
            }`}
          >
            {TYPE_LABELS[type] ?? type}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <button
        onClick={() => {/* TODO: open add entry modal */}}
        className="cursor-pointer flex items-center gap-1.5 rounded-md bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-surface/80 transition-colors"
      >
        <Plus size={14} />
        Add entry
      </button>

      <button
        onClick={handleScrape}
        disabled={scraping}
        className="cursor-pointer flex items-center gap-1.5 rounded-md border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        {scraping ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
        Scrape website
      </button>

      <button
        onClick={handleGenerateBrandProfile}
        disabled={generating}
        className="cursor-pointer flex items-center gap-1.5 rounded-md border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Generate brand profile
      </button>
    </div>
  );
}
