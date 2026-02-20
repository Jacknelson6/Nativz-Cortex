'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterChip } from './filter-chip';
import { ClientSelector } from './client-selector';
import {
  SOURCE_OPTIONS,
  TIME_RANGE_OPTIONS,
  LANGUAGE_OPTIONS,
  COUNTRY_OPTIONS,
} from '@/lib/types/search';
import type { SearchMode } from '@/lib/types/search';

interface SearchFormProps {
  redirectPrefix?: string;
  fixedClientId?: string | null;
  hideClientSelector?: boolean;
}

const PLACEHOLDER_EXAMPLES = [
  'sustainable fashion trends',
  'AI video editing tools 2026',
  'coffee shop marketing ideas',
  'plant-based protein market',
  'luxury real estate content',
  'pet wellness brand strategy',
];

export function SearchForm({ redirectPrefix = '', fixedClientId, hideClientSelector = false }: SearchFormProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [timeRange, setTimeRange] = useState('last_3_months');
  const [language, setLanguage] = useState('all');
  const [country, setCountry] = useState('us');
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [searchMode, setSearchMode] = useState<SearchMode>(fixedClientId ? 'client_strategy' : 'general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate placeholder examples (Pattern #16)
  useEffect(() => {
    if (query) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [query]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          source,
          time_range: timeRange,
          language,
          country,
          client_id: clientId,
          search_mode: clientId ? searchMode : 'general',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.');
        setError(msg);
        setLoading(false);
        return;
      }

      // Redirect to the processing page immediately
      router.push(`${redirectPrefix}/search/${data.id}/processing`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSearch} className="w-full">
      {/* Search input */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
            className="w-full rounded-xl border border-nativz-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_rgba(4,107,210,0.15)]"
            disabled={loading}
          />
        </div>
        <div className="relative">
          <Button type="submit" size="lg" shape="pill" disabled={loading || !query.trim()}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Starting...
              </>
            ) : (
              'Search'
            )}
          </Button>
          {/* Noise texture overlay */}
          {!loading && (
            <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden opacity-[0.12]">
              <svg className="h-full w-full">
                <filter id="noise">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                  <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect width="100%" height="100%" filter="url(#noise)" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip
          label="Source"
          value={source}
          options={SOURCE_OPTIONS}
          onChange={setSource}
        />
        <FilterChip
          label="Time range"
          value={timeRange}
          options={TIME_RANGE_OPTIONS}
          onChange={setTimeRange}
        />
        <FilterChip
          label="Language"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
        />
        <FilterChip
          label="Country"
          value={country}
          options={COUNTRY_OPTIONS}
          onChange={setCountry}
        />
        {!hideClientSelector && (
          <>
            <div className="h-4 w-px bg-nativz-border" />
            <ClientSelector
              value={clientId}
              onChange={(id) => {
                setClientId(id);
                setSearchMode(id ? 'client_strategy' : 'general');
              }}
            />
          </>
        )}
      </div>

      {/* Search mode toggle — only when a client is selected */}
      {clientId && (
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-surface-hover p-1 w-fit">
          <button
            type="button"
            onClick={() => setSearchMode('general')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              searchMode === 'general'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            General research
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('client_strategy')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              searchMode === 'client_strategy'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Client strategy
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}
    </form>
  );
}
