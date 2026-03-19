'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterChip } from './filter-chip';
import { ClientSelector } from './client-selector';
import { PLATFORM_CONFIG } from './platform-icon';
import {
  TIME_RANGE_OPTIONS,
  PLATFORM_OPTIONS,
} from '@/lib/types/search';
import type { SearchMode, SearchPlatform, SearchVolume } from '@/lib/types/search';

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
  const source = 'all';
  const [timeRange, setTimeRange] = useState('last_3_months');
  const language = 'all';
  const country = 'us';
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [searchMode, setSearchMode] = useState<SearchMode>(fixedClientId ? 'client_strategy' : 'general');
  const [platforms, setPlatforms] = useState<Set<SearchPlatform>>(new Set(['web', 'reddit', 'youtube', 'tiktok']));
  const [volume, setVolume] = useState<SearchVolume>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [platformAvailability, setPlatformAvailability] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch platform availability (which API keys are configured)
  useEffect(() => {
    fetch('/api/search/platforms')
      .then((r) => r.ok ? r.json() : {})
      .then(setPlatformAvailability)
      .catch(() => {});
  }, []);

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
          platforms: Array.from(platforms),
          volume,
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
            className="w-full rounded-xl border border-nativz-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_var(--focus-ring)]"
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
          label="Time range"
          value={timeRange}
          options={TIME_RANGE_OPTIONS}
          onChange={setTimeRange}
        />
        <div className="h-4 w-px bg-nativz-border" />

        {/* Platform checkboxes */}
        {PLATFORM_OPTIONS.filter((p) => p.available).map((p) => {
          const config = PLATFORM_CONFIG[p.value];
          const Icon = config.icon;
          const isConfigured = platformAvailability[p.value] !== false;
          const isActive = platforms.has(p.value);
          const isWeb = p.value === 'web';

          return (
            <button
              key={p.value}
              type="button"
              title={!isConfigured ? `${p.label} — API key not configured` : undefined}
              onClick={() => {
                if (isWeb) return;
                if (!isConfigured) return;
                setPlatforms((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.value)) next.delete(p.value);
                  else next.add(p.value);
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                !isConfigured
                  ? 'bg-surface text-text-muted/40 border border-nativz-border/50 cursor-not-allowed'
                  : isActive
                    ? 'bg-accent-surface text-accent-text'
                    : isWeb
                      ? 'bg-accent-surface/50 text-accent-text/60 cursor-default'
                      : 'bg-surface text-text-muted hover:bg-surface-hover hover:text-text-secondary border border-nativz-border cursor-pointer'
              }`}
            >
              {!isConfigured ? (
                <AlertCircle size={12} className="text-amber-500/60" />
              ) : (
                <Icon size={12} className={isActive ? config.color : ''} />
              )}
              {p.label}
            </button>
          );
        })}

        <div className="h-4 w-px bg-nativz-border" />

        {/* Depth selector */}
        <div className="flex items-center gap-1 rounded-lg bg-surface-hover p-0.5">
          {([
            { value: 'light' as const, label: 'Light', tip: '~20 sources · Fast scan' },
            { value: 'medium' as const, label: 'Medium', tip: '~100 sources · Recommended' },
            { value: 'deep' as const, label: 'Deep', tip: '500+ sources · Full analysis' },
          ]).map((opt) => (
            <div key={opt.value} className="relative group">
              <button
                type="button"
                onClick={() => setVolume(opt.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  volume === opt.value ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {opt.label}
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-[#1a1d27] border border-white/[0.08] text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
                {opt.tip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-[#1a1d27]" />
              </div>
            </div>
          ))}
        </div>

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
