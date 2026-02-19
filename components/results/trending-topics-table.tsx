'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Eye, Link2 } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { formatNumber } from '@/lib/utils/format';
import { getSentimentBadgeVariant, getSentimentLabel } from '@/lib/utils/sentiment';
import { TOOLTIPS } from '@/lib/tooltips';
import { TopicRowExpanded } from './topic-row-expanded';
import { hasSources } from '@/lib/types/search';
import type { TrendingTopic, LegacyTrendingTopic } from '@/lib/types/search';

interface TrendingTopicsTableProps {
  topics: (TrendingTopic | LegacyTrendingTopic)[];
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

type SortKey = 'views' | 'resonance' | 'sentiment';
type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  tooltip,
  align = 'center',
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  tooltip?: { title: string; description: string };
  align?: 'center' | 'right';
}) {
  const isActive = activeKey === sortKey;
  const alignClass = align === 'right' ? 'justify-end' : 'justify-center';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 ${alignClass} transition-colors hover:text-text-secondary ${isActive ? 'text-text-secondary' : ''}`}
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

export function TrendingTopicsTable({ topics }: TrendingTopicsTableProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const isNewShape = topics.length > 0 && hasSources(topics[0]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setExpandedIndex(null);
  }

  function getViewsValue(topic: TrendingTopic | LegacyTrendingTopic): number {
    if (hasSources(topic)) return topic.sources.length;
    if ('estimated_views' in topic) return (topic as LegacyTrendingTopic).estimated_views;
    return 0;
  }

  const sortedTopics = useMemo(() => {
    if (!sortKey) return topics;
    const sorted = [...topics].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'views':
          diff = getViewsValue(a) - getViewsValue(b);
          break;
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

  const gridCols = isNewShape
    ? 'grid-cols-[1fr_100px_120px_120px]'
    : 'grid-cols-[1fr_120px_120px_130px]';

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
            label={isNewShape ? 'Sources' : 'Est. views'}
            sortKey="views"
            activeKey={sortKey}
            activeDir={sortDir}
            onSort={handleSort}
            align={isNewShape ? 'center' : 'right'}
          />
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
        </div>

        {/* Rows */}
        {sortedTopics.map((topic, i) => (
          <div
            key={topic.name}
            className="animate-stagger-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <button
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className={`table-row-guideline grid w-full ${gridCols} gap-4 items-center px-6 py-3.5 text-left hover:bg-surface-hover transition-colors`}
            >
              <div className="flex items-center gap-2">
                {expandedIndex === i ? (
                  <ChevronDown size={14} className="text-text-muted shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-text-muted shrink-0" />
                )}
                <span className="text-sm font-medium text-text-primary truncate">{topic.name}</span>
              </div>

              {isNewShape && hasSources(topic) ? (
                <span className="text-center text-sm text-text-secondary flex items-center justify-center gap-1">
                  <Link2 size={12} className="text-text-muted" />
                  {topic.sources.length}
                </span>
              ) : !isNewShape && 'estimated_views' in topic ? (
                <span className="text-right text-sm text-text-secondary flex items-center justify-end gap-1">
                  <Eye size={12} className="text-text-muted" />
                  {formatNumber((topic as LegacyTrendingTopic).estimated_views)}
                </span>
              ) : null}

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
            </button>

            {expandedIndex === i && (
              <TopicRowExpanded topic={topic} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
