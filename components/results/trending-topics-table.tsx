'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils/format';
import { getSentimentBadgeVariant, getSentimentLabel } from '@/lib/utils/sentiment';
import { TopicRowExpanded } from './topic-row-expanded';
import type { TrendingTopic } from '@/lib/types/search';

interface TrendingTopicsTableProps {
  topics: TrendingTopic[];
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

  return (
    <Card padding="none">
      <div className="p-6 pb-0">
        <CardTitle>Trending topics</CardTitle>
      </div>

      <div className="mt-4">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_90px_90px_90px] gap-2 border-b border-gray-100 px-6 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span>Topic</span>
          <span className="text-right">Est. views</span>
          <span className="text-center">Resonance</span>
          <span className="text-center">Sentiment</span>
          <span className="text-right">Date</span>
        </div>

        {/* Rows */}
        {topics.map((topic, i) => (
          <div key={i}>
            <button
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="grid w-full grid-cols-[1fr_100px_90px_90px_90px] gap-2 items-center px-6 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
            >
              <div className="flex items-center gap-2">
                {expandedIndex === i ? (
                  <ChevronDown size={14} className="text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-gray-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-900 truncate">{topic.name}</span>
              </div>
              <span className="text-right text-sm text-gray-600 flex items-center justify-end gap-1">
                <Eye size={12} className="text-gray-400" />
                {formatNumber(topic.estimated_views)}
              </span>
              <span className="text-center">
                <Badge variant={RESONANCE_VARIANT[topic.resonance] || 'default'}>
                  {topic.resonance}
                </Badge>
              </span>
              <span className="text-center">
                <Badge variant={getSentimentBadgeVariant(topic.sentiment)}>
                  {getSentimentLabel(topic.sentiment)}
                </Badge>
              </span>
              <span className="text-right text-xs text-gray-400">{topic.date}</span>
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
