'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import { TopicRowExpanded } from './topic-row-expanded';
import { SentimentSplitBar } from './sentiment-split-bar';
import { formatTopicReach, getTopicReachValue, RESONANCE_LABEL } from '@/lib/search/topic-metrics';
import type { TrendingTopic, LegacyTrendingTopic } from '@/lib/types/search';

interface TrendingTopicsTableProps {
  topics: (TrendingTopic | LegacyTrendingTopic)[];
  clientId?: string | null;
  searchId?: string;
}

const RESONANCE_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  viral: 3,
};

const TOPIC_FALLBACK_EMOJI = ['🔍', '🤖', '📣', '💡', '🎯', '✨', '📊', '🎬', '🎨', '📈'];

type SortKey = 'resonance' | 'sentiment' | 'reach';
type SortDir = 'asc' | 'desc';

/** Shared grid keeps Views / Resonance / Sentiment / actions aligned on header and rows. */
const METRICS_GRID =
  'grid shrink-0 grid-cols-[minmax(5rem,7.5rem)_minmax(4.75rem,6rem)_minmax(152px,172px)_minmax(4.75rem,5.5rem)] gap-x-4 gap-y-1 items-center sm:gap-x-6 lg:gap-x-8';

function TopicTitleCell({ name, index }: { name: string; index: number }) {
  const leading = name.match(/^(\p{Extended_Pictographic})\s*/u);
  const emoji = leading?.[1];
  const label = emoji ? name.slice(leading![0].length) : name;
  const displayEmoji = emoji ?? TOPIC_FALLBACK_EMOJI[index % TOPIC_FALLBACK_EMOJI.length];

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="text-xl leading-none shrink-0 sm:text-2xl" aria-hidden>
        {displayEmoji}
      </span>
      <span className="min-w-0 text-base font-semibold leading-snug text-text-primary break-words whitespace-normal">
        {label}
      </span>
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  tooltip,
  centered = false,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  tooltip?: { title: string; description: string };
  centered?: boolean;
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex w-full items-center gap-1 transition-colors hover:text-text-secondary ${
        centered ? 'justify-center' : 'justify-end'
      } ${isActive ? 'text-text-secondary' : 'text-text-muted'}`}
    >
      {tooltip ? (
        <TooltipCard title={tooltip.title} description={tooltip.description}>
          <span className="text-sm font-medium normal-case">{label}</span>
        </TooltipCard>
      ) : (
        <span className="text-sm font-medium normal-case">{label}</span>
      )}
      <span className="flex flex-col -space-y-1">
        <ChevronUp size={10} className={isActive && activeDir === 'asc' ? 'text-accent-text' : 'opacity-30'} />
        <ChevronDown size={10} className={isActive && activeDir === 'desc' ? 'text-accent-text' : 'opacity-30'} />
      </span>
    </button>
  );
}

export function TrendingTopicsTable({ topics, clientId, searchId }: TrendingTopicsTableProps): React.JSX.Element | null {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('resonance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setExpandedIndex(null);
  }

  async function copyTopicTitle(topic: TrendingTopic | LegacyTrendingTopic) {
    try {
      await navigator.clipboard.writeText(topic.name);
      toast.success('Copied topic');
    } catch {
      toast.error('Could not copy');
    }
  }

  const sortedTopics = useMemo(() => {
    const sorted = [...topics].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'resonance':
          diff = (RESONANCE_ORDER[a.resonance] ?? 0) - (RESONANCE_ORDER[b.resonance] ?? 0);
          break;
        case 'sentiment':
          diff = a.sentiment - b.sentiment;
          break;
        case 'reach':
          diff = getTopicReachValue(a) - getTopicReachValue(b);
          break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });
    return sorted;
  }, [topics, sortKey, sortDir]);

  if (!topics.length) return null;

  return (
    <Card padding="none" elevated className="overflow-hidden">
      <div className="border-b border-nativz-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-end justify-between gap-4 sm:gap-6">
          <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Trending topics
          </span>
          <div className={METRICS_GRID}>
            <div className="min-w-0">
              <SortHeader
                label="Views"
                sortKey="reach"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                tooltip={TOOLTIPS.views}
              />
            </div>
            <div className="min-w-0">
              <SortHeader
                label="Resonance"
                sortKey="resonance"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                tooltip={TOOLTIPS.resonance}
                centered
              />
            </div>
            <div className="min-w-0 flex justify-end">
              <SortHeader
                label="Sentiment"
                sortKey="sentiment"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                tooltip={TOOLTIPS.sentiment}
              />
            </div>
            <span className="min-w-0" aria-hidden />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-0">
          {sortedTopics.map((topic, i) => (
            <div key={topic.name} className="animate-stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                aria-expanded={expandedIndex === i}
                className="flex w-full min-w-0 items-center justify-between gap-4 border-b border-nativz-border/80 px-4 py-4 last:border-b-0 sm:gap-6 sm:px-6 sm:py-4 transition-colors hover:bg-surface-hover/60 text-left cursor-pointer"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {expandedIndex === i ? (
                      <ChevronDown size={18} className="shrink-0 text-text-muted" />
                    ) : (
                      <ChevronRight size={18} className="shrink-0 text-text-muted" />
                    )}
                    <TopicTitleCell name={topic.name} index={i} />
                  </div>
                </div>

                <div className={METRICS_GRID}>
                  <span className="min-w-0 text-right text-base font-semibold tabular-nums text-text-primary">
                    {formatTopicReach(topic)}
                  </span>
                  <span className="min-w-0 text-center text-base font-medium text-text-secondary">
                    {RESONANCE_LABEL[topic.resonance] ?? topic.resonance}
                  </span>
                  <div className="min-w-0 flex justify-end">
                    <SentimentSplitBar sentiment={topic.sentiment} />
                  </div>
                  <div className="flex min-w-0 items-center justify-end gap-0.5">
                    <TooltipCard
                      iconTrigger
                      title={TOOLTIPS.trending_topic_copy.title}
                      description={TOOLTIPS.trending_topic_copy.description}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyTopicTitle(topic);
                        }}
                        className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
                        aria-label="Copy topic title"
                      >
                        <Copy size={16} />
                      </button>
                    </TooltipCard>
                  </div>
                </div>
              </button>

              {expandedIndex === i && (
                <TopicRowExpanded topic={topic} clientId={clientId} searchId={searchId} />
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
