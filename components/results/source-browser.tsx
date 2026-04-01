'use client';

import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { SourceMentionCard } from '@/components/results/source-mention-card';
import type { PlatformSource } from '@/lib/types/search';

/** Deterministic shuffle based on source id so order is stable across re-renders */
function seededShuffle<T extends { id: string }>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const hash = copy[i].id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const j = Math.abs(hash) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sourceKey(source: PlatformSource): string {
  return `${source.platform}:${source.id}`;
}

interface SourceBrowserProps {
  sources: PlatformSource[];
}

export function SourceBrowser({ sources }: SourceBrowserProps) {
  const [showAll, setShowAll] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  const listSources = sources ?? [];

  const toggleSave = (key: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!listSources.length) return null;

  const shuffled = seededShuffle(listSources);
  const displayed = showAll ? shuffled : shuffled.slice(0, 12);

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-text-primary">Sources</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Short-form video sources across platforms
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayed.map((source) => {
          const key = sourceKey(source);
          return (
            <SourceMentionCard
              key={key}
              source={source}
              saved={savedIds.has(key)}
              onToggleSave={() => toggleSave(key)}
            />
          );
        })}
      </div>

      {!showAll && shuffled.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full text-center text-xs text-accent-text hover:underline cursor-pointer py-2"
        >
          Show more
        </button>
      )}
    </Card>
  );
}
