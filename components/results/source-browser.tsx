'use client';

import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { SourceMentionCard } from '@/components/results/source-mention-card';
import type { PlatformSource, SearchPlatform } from '@/lib/types/search';

function engagementScore(source: PlatformSource): number {
  const { views = 0, likes = 0, comments = 0, shares = 0, score = 0 } = source.engagement;
  return views + likes * 10 + comments * 5 + shares * 8 + score * 2;
}

function sourceKey(source: PlatformSource): string {
  return `${source.platform}:${source.id}`;
}

type PlatformTab = 'all' | 'saved' | SearchPlatform;
type SortMode = 'engagement' | 'recent';

interface SourceBrowserProps {
  sources: PlatformSource[];
}

export function SourceBrowser({ sources }: SourceBrowserProps) {
  const [activeTab, setActiveTab] = useState<PlatformTab>('all');
  const [sort, setSort] = useState<SortMode>('engagement');
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

  const platforms = Array.from(new Set(listSources.map((s) => s.platform)));
  const platformCounts = platforms.reduce<Record<string, number>>((acc, p) => {
    acc[p] = listSources.filter((s) => s.platform === p).length;
    return acc;
  }, {});

  let filtered =
    activeTab === 'all'
      ? listSources
      : activeTab === 'saved'
        ? listSources.filter((s) => savedIds.has(sourceKey(s)))
        : listSources.filter((s) => s.platform === activeTab);

  filtered = [...filtered].sort((a, b) => {
    if (sort === 'engagement') return engagementScore(b) - engagementScore(a);
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  if (!listSources.length) return null;

  const displayed = showAll ? filtered : filtered.slice(0, 12);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Specific sources</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {listSources.length} sources · thumbnails for short-form and long-form video when available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="source-sort">
            Sort
          </label>
          <select
            id="source-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="rounded-lg border border-nativz-border bg-background/80 px-2 py-1.5 text-xs text-text-primary cursor-pointer"
          >
            <option value="engagement">Most engagement</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-white/[0.04] rounded-lg p-0.5 w-fit flex-wrap">
        <button
          type="button"
          onClick={() => {
            setActiveTab('all');
            setShowAll(false);
          }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'all' ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('saved');
            setShowAll(false);
          }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'saved' ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Saved ({savedIds.size})
        </button>
        {platforms.map((p) => {
          const config = PLATFORM_CONFIG[p];
          const Icon = config.icon;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setActiveTab(p);
                setShowAll(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === p ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={12} className={config.color} />
              <span>{config.label}</span>
              <span className="text-text-muted">({platformCounts[p] ?? 0})</span>
            </button>
          );
        })}
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

      {!showAll && filtered.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full text-center text-xs text-accent-text hover:underline cursor-pointer py-2"
        >
          Show all {filtered.length} sources
        </button>
      )}

      {filtered.length === 0 && activeTab === 'saved' && (
        <p className="text-sm text-text-muted text-center py-8">No saved sources yet. Use the bookmark on a card.</p>
      )}
    </Card>
  );
}
