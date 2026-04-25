'use client';

import React, { useState, useMemo, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, Copy } from 'lucide-react';
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

type SortKey = 'resonance' | 'sentiment' | 'reach';
type SortDir = 'asc' | 'desc';

/** Shared grid keeps Views / Resonance / Sentiment / actions aligned on header and rows. */
const METRICS_GRID =
  'grid shrink-0 grid-cols-[minmax(5rem,7.5rem)_minmax(4.75rem,6rem)_minmax(152px,172px)_minmax(4.75rem,7rem)] gap-x-4 gap-y-1 items-center sm:gap-x-6 lg:gap-x-8';

/** Per-row index anchor — replaces the former emoji column.
 *  The emoji treatment (user-prefix detection + a hard-coded fallback pool
 *  of 🔍🤖📣💡🎯✨📊🎬🎨📈) read as AI slop next to the data-first Nativz
 *  aesthetic. A muted 2-digit monospace rank keeps the row scannable without
 *  the chroma. Any leading emoji still emitted by the LLM is stripped. */
function TopicTitleCell({ name, index }: { name: string; index: number }) {
  const leading = name.match(/^(\p{Extended_Pictographic})\s*/u);
  const label = leading ? name.slice(leading[0].length) : name;

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="w-7 shrink-0 font-mono text-[11px] tabular-nums text-text-muted/70"
      >
        {String(index + 1).padStart(2, '0')}
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
  const ariaSort = isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={ariaSort}
      aria-label={`Sort by ${label}${isActive ? ` (currently ${ariaSort})` : ''}`}
      className={`flex w-full items-center gap-1 rounded-md px-0.5 py-1 transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
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
      <span aria-hidden className="flex flex-col -space-y-1">
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
          <h3 className="min-w-0 text-lg font-semibold tracking-tight text-text-primary">
            Trending topics
          </h3>
          <div className={METRICS_GRID}>
            <div className="min-w-0">
              <SortHeader
                label="Views"
                sortKey="reach"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                tooltip={TOOLTIPS.views}
                centered
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
            <div className="min-w-0">
              <SortHeader
                label="Sentiment"
                sortKey="sentiment"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                tooltip={TOOLTIPS.sentiment}
                centered
              />
            </div>
            <span className="min-w-0" aria-hidden />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-0">
          {sortedTopics.map((topic, i) => {
            const isExpanded = expandedIndex === i;
            function toggleRow() {
              setExpandedIndex(isExpanded ? null : i);
            }
            function handleRowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRow();
              }
            }
            return (
              <div key={topic.name} className="animate-stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
                {/* Row uses role=button instead of a <button> element so the
                    copy action (also a button) isn't nested inside another
                    interactive element — invalid HTML + breaks screen readers. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggleRow}
                  onKeyDown={handleRowKeyDown}
                  aria-expanded={isExpanded}
                  className="flex w-full min-w-0 items-center justify-between gap-4 border-b border-nativz-border/80 px-4 py-4 last:border-b-0 sm:gap-6 sm:px-6 sm:py-4 transition-colors hover:bg-surface-hover/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <ChevronRight
                        aria-hidden
                        size={18}
                        className={`shrink-0 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <TopicTitleCell name={topic.name} index={i} />
                    </div>
                  </div>

                  <div className={METRICS_GRID}>
                    <span className="min-w-0 text-center text-base font-semibold tabular-nums text-text-primary">
                      {formatTopicReach(topic)}
                    </span>
                    <span className="min-w-0 text-center text-base font-semibold text-text-primary">
                      {RESONANCE_LABEL[topic.resonance] ?? topic.resonance}
                    </span>
                    <div className="min-w-0 flex justify-center">
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
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                          aria-label="Copy topic title"
                        >
                          <Copy size={16} />
                        </button>
                      </TooltipCard>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <TopicRowExpanded topic={topic} clientId={clientId} searchId={searchId} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
