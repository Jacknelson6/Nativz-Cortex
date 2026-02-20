'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Bookmark, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { getSentimentBadgeVariant, getSentimentLabel } from '@/lib/utils/sentiment';
import { TOOLTIPS } from '@/lib/tooltips';
import { TopicRowExpanded } from './topic-row-expanded';
import type { TrendingTopic, LegacyTrendingTopic } from '@/lib/types/search';

interface TrendingTopicsTableProps {
  topics: (TrendingTopic | LegacyTrendingTopic)[];
  clientId?: string | null;
  searchId?: string;
}

const RESONANCE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'> = {
  low: 'default',
  medium: 'info',
  high: 'success',
  viral: 'purple',
};

const RESONANCE_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  viral: 3,
};

type SortKey = 'resonance' | 'sentiment';
type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  tooltip,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  tooltip?: { title: string; description: string };
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 justify-center transition-colors hover:text-text-secondary ${isActive ? 'text-text-secondary' : ''}`}
    >
      {tooltip ? (
        <TooltipCard title={tooltip.title} description={tooltip.description}>
          {label}
        </TooltipCard>
      ) : (
        label
      )}
      <span className="flex flex-col -space-y-1">
        <ChevronUp size={10} className={isActive && activeDir === 'asc' ? 'text-accent-text' : 'opacity-30'} />
        <ChevronDown size={10} className={isActive && activeDir === 'desc' ? 'text-accent-text' : 'opacity-30'} />
      </span>
    </button>
  );
}

export function TrendingTopicsTable({ topics, clientId, searchId }: TrendingTopicsTableProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [savedTopics, setSavedTopics] = useState<Set<string>>(new Set());
  const [savingTopic, setSavingTopic] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setExpandedIndex(null);
  }

  async function handleSave(topic: TrendingTopic | LegacyTrendingTopic) {
    if (savedTopics.has(topic.name)) return;
    setSavingTopic(topic.name);

    try {
      const description = [
        'posts_overview' in topic ? topic.posts_overview : '',
        'comments_overview' in topic ? topic.comments_overview : '',
      ].filter(Boolean).join('\n\n');

      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topic.name,
          description: description || `Trending topic with ${topic.resonance} resonance`,
          category: 'trending_topic',
          client_id: clientId || undefined,
        }),
      });

      if (res.ok) {
        setSavedTopics((prev) => new Set(prev).add(topic.name));
        toast.success('Saved to ideas');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save. Try again.');
    } finally {
      setSavingTopic(null);
    }
  }

  const sortedTopics = useMemo(() => {
    if (!sortKey) return topics;
    const sorted = [...topics].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'resonance':
          diff = (RESONANCE_ORDER[a.resonance] ?? 0) - (RESONANCE_ORDER[b.resonance] ?? 0);
          break;
        case 'sentiment':
          diff = a.sentiment - b.sentiment;
          break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });
    return sorted;
  }, [topics, sortKey, sortDir]);

  if (!topics.length) return null;

  const gridCols = 'grid-cols-[1fr_120px_120px_60px]';

  return (
    <Card padding="none">
      <div className="p-6 pb-0">
        <CardTitle>Trending topics</CardTitle>
      </div>

      <div className="mt-4">
        {/* Table header */}
        <div className={`grid ${gridCols} gap-4 border-b border-nativz-border px-6 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide`}>
          <span>Topic</span>
          <SortHeader
            label="Resonance"
            sortKey="resonance"
            activeKey={sortKey}
            activeDir={sortDir}
            onSort={handleSort}
            tooltip={TOOLTIPS.resonance}
          />
          <SortHeader
            label="Sentiment"
            sortKey="sentiment"
            activeKey={sortKey}
            activeDir={sortDir}
            onSort={handleSort}
            tooltip={TOOLTIPS.sentiment}
          />
          <span className="text-center">Save</span>
        </div>

        {/* Rows */}
        {sortedTopics.map((topic, i) => (
          <div
            key={topic.name}
            className="animate-stagger-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className={`grid w-full ${gridCols} gap-4 items-center px-6 py-3.5 transition-colors hover:bg-surface-hover`}>
              <button
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                className="flex items-center gap-2 text-left min-w-0"
              >
                {expandedIndex === i ? (
                  <ChevronDown size={14} className="text-text-muted shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-text-muted shrink-0" />
                )}
                <span className="text-sm font-medium text-text-primary truncate">{topic.name}</span>
              </button>

              <span className="text-center">
                <Badge variant={RESONANCE_VARIANT[topic.resonance] || 'default'}>
                  {topic.resonance}
                </Badge>
              </span>
              <span className="text-center whitespace-nowrap">
                <Badge variant={getSentimentBadgeVariant(topic.sentiment)}>
                  {getSentimentLabel(topic.sentiment)}
                </Badge>
              </span>
              <span className="flex justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave(topic);
                  }}
                  disabled={savedTopics.has(topic.name) || savingTopic === topic.name}
                  className={`rounded-lg p-1.5 transition-colors ${
                    savedTopics.has(topic.name)
                      ? 'text-emerald-400'
                      : 'text-text-muted hover:text-accent-text hover:bg-accent-surface'
                  } disabled:pointer-events-none`}
                  title={savedTopics.has(topic.name) ? 'Saved' : 'Save to ideas'}
                >
                  {savedTopics.has(topic.name) ? (
                    <Check size={16} />
                  ) : (
                    <Bookmark size={16} className={savingTopic === topic.name ? 'animate-pulse' : ''} />
                  )}
                </button>
              </span>
            </div>

            {expandedIndex === i && (
              <TopicRowExpanded topic={topic} clientId={clientId} searchId={searchId} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
