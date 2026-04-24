'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ChevronDown, Loader2 } from 'lucide-react';

interface TopicSuggestion {
  topic: string;
  angle: string;
  searchQuery: string;
}

interface RelatedTopicsProps {
  searchId: string;
}

export function RelatedTopics({ searchId }: RelatedTopicsProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [error, setError] = useState('');

  async function handleExpand() {
    if (suggestions.length > 0) {
      setExpanded(!expanded);
      return;
    }

    setExpanded(true);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/search/${searchId}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to generate suggestions');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleResearch(query: string) {
    router.push(`/finder/new?query=${encodeURIComponent(query)}`);
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      {/* Header with expand button */}
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-center gap-3 text-left cursor-pointer"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-surface shrink-0">
          <Sparkles size={16} className="text-accent-text" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Explore related topics</h3>
          <p className="text-xs text-text-muted">Discover adjacent research directions</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-nativz-border">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={16} className="animate-spin text-accent-text" />
              <span className="text-sm text-text-muted">Generating suggestions...</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 py-4 text-center">{error}</p>
          )}

          {!loading && suggestions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="group rounded-xl border border-nativz-border bg-background p-4 transition-colors hover:border-accent/30"
                >
                  <p className="text-sm font-medium text-text-primary mb-1">{s.topic}</p>
                  <p className="text-xs text-text-muted mb-3 line-clamp-2">{s.angle}</p>
                  <button
                    type="button"
                    onClick={() => handleResearch(s.searchQuery)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-text hover:text-accent-hover transition-colors cursor-pointer"
                  >
                    Research this
                    <ArrowRight size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
