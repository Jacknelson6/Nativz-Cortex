'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Link2 } from 'lucide-react';
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

export function TrendingTopicsTable({ topics }: TrendingTopicsTableProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!topics.length) return null;

  // Detect if topics use new shape (sources) or legacy (estimated_views + date)
  const isNewShape = topics.length > 0 && hasSources(topics[0]);

  return (
    <Card padding="none">
      <div className="p-6 pb-0">
        <CardTitle>Trending topics</CardTitle>
      </div>

      <div className="mt-4">
        {/* Table header */}
        {isNewShape ? (
          <div className="grid grid-cols-[1fr_80px_90px_110px] gap-2 border-b border-nativz-border px-6 py-2 text-xs font-medium text-text-muted uppercase tracking-wide">
            <span>Topic</span>
            <span className="text-center">Sources</span>
            <span className="text-center">
              <TooltipCard title={TOOLTIPS.resonance.title} description={TOOLTIPS.resonance.description}>
                Resonance
              </TooltipCard>
            </span>
            <span className="text-center">
              <TooltipCard title={TOOLTIPS.sentiment.title} description={TOOLTIPS.sentiment.description}>
                Sentiment
              </TooltipCard>
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_100px_90px_110px] gap-2 border-b border-nativz-border px-6 py-2 text-xs font-medium text-text-muted uppercase tracking-wide">
            <span>Topic</span>
            <span className="text-right">Est. views</span>
            <span className="text-center">
              <TooltipCard title={TOOLTIPS.resonance.title} description={TOOLTIPS.resonance.description}>
                Resonance
              </TooltipCard>
            </span>
            <span className="text-center">
              <TooltipCard title={TOOLTIPS.sentiment.title} description={TOOLTIPS.sentiment.description}>
                Sentiment
              </TooltipCard>
            </span>
          </div>
        )}

        {/* Rows */}
        {topics.map((topic, i) => (
          <div
            key={i}
            className="animate-stagger-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <button
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className={`table-row-guideline grid w-full ${isNewShape ? 'grid-cols-[1fr_80px_90px_110px]' : 'grid-cols-[1fr_100px_90px_110px]'} gap-2 items-center px-6 py-3 text-left hover:bg-surface-hover transition-colors`}
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

            {/* Expanded content */}
            {expandedIndex === i && (
              <TopicRowExpanded topic={topic} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
