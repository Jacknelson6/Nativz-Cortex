'use client';

import { useState } from 'react';
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

interface SearchFormProps {
  redirectPrefix?: string;
  fixedClientId?: string | null;
  hideClientSelector?: boolean;
}

export function SearchForm({ redirectPrefix = '', fixedClientId, hideClientSelector = false }: SearchFormProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [timeRange, setTimeRange] = useState('last_3_months');
  const [language, setLanguage] = useState('all');
  const [country, setCountry] = useState('us');
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          source,
          time_range: timeRange,
          language,
          country,
          client_id: clientId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.');
        setError(msg);
        setLoading(false);
        return;
      }

      router.push(`${redirectPrefix}/search/${data.id}`);
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
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any topic, trend, or niche..."
            className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={loading}
          />
        </div>
        <Button type="submit" size="lg" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Searching...
            </>
          ) : (
            'Search'
          )}
        </Button>
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
            <div className="h-4 w-px bg-gray-200" />
            <ClientSelector value={clientId} onChange={setClientId} />
          </>
        )}
      </div>

      {loading && (
        <p className="mt-3 text-sm text-gray-500">
          Gathering search data and generating your report — this usually takes 1-2 minutes.
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </form>
  );
}
