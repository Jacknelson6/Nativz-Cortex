'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Bookmark, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { getSentimentLabel } from '@/lib/utils/sentiment';
import { TOOLTIPS } from '@/lib/tooltips';
import { formatCompactCount } from '@/lib/utils/format';
import { TopicRowExpanded } from './topic-row-expanded';
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

const RESONANCE_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  viral: 'Viral',
};

const TOPIC_FALLBACK_EMOJI = ['🔍', '🤖', '📣', '💡', '🎯', '✨', '📊', '🎬', '🎨', '📈'];

type SortKey = 'resonance' | 'sentiment' | 'reach';
type SortDir = 'asc' | 'desc';

/** Shared grid keeps Views / Resonance / Sentiment / actions aligned on header and rows. */
const METRICS_GRID =
  'grid shrink-0 grid-cols-[minmax(5rem,7.5rem)_minmax(4.75rem,6rem)_minmax(152px,172px)_minmax(4.75rem,5.5rem)] gap-x-4 gap-y-1 items-center sm:gap-x-6 lg:gap-x-8';

function getTopicReachValue(topic: TrendingTopic | LegacyTrendingTopic): number {
  if ('total_engagement' in topic && typeof (topic as TrendingTopic).total_engagement === 'number') {
    return Math.max(0, (topic as TrendingTopic).total_engagement ?? 0);
  }
  if ('estimated_views' in topic && typeof topic.estimated_views === 'number') {
    return Math.max(0, topic.estimated_views);
  }
  return 0;
}

function formatTopicReach(topic: TrendingTopic | LegacyTrendingTopic): string {
  const v = getTopicReachValue(topic);
  if (v <= 0) return '—';
  return formatCompactCount(v);
}

function SentimentSplitBar({ sentiment }: { sentiment: number }) {
  const pos = Math.max(0, Math.min(1, (sentiment + 1) / 2));
  const neg = 1 - pos;
  const posPercent = Math.round(pos * 100);
  const negPercent = Math.round(neg * 100);
  return (
    <div className="flex items-center gap-2 shrink-0" title={getSentimentLabel(sentiment)}>
      <span className="text-xs tabular-nums text-emerald-400/90 w-8 text-right">{posPercent}%</span>
      <div className="flex h-2.5 w-[76px] sm:w-[84px] gap-0.5 overflow-hidden rounded-full">
        <div className="h-full min-w-[3px] rounded-l-full bg-emerald-500/85" style={{ width: `${pos * 100}%` }} />
        <div className="h-full min-w-[3px] rounded-r-full bg-red-500/85" style={{ width: `${neg * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums text-red-400/90 w-8">{negPercent}%</span>
    </div>
  );
}

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
      <span className="min-w-0 text-base font-semibold leading-snug text-text-primary break-words whitespace-normal sm:text-[17px]">
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
          <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:text-xs">
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
              <div
                className="flex min-w-0 items-center justify-between gap-4 border-b border-nativz-border/80 px-4 py-4 last:border-b-0 sm:gap-6 sm:px-6 sm:py-4 transition-colors hover:bg-surface-hover/60"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expandedIndex === i}
                  >
                    {expandedIndex === i ? (
                      <ChevronDown size={18} className="shrink-0 text-text-muted" />
                    ) : (
                      <ChevronRight size={18} className="shrink-0 text-text-muted" />
                    )}
                    <TopicTitleCell name={topic.name} index={i} />
                  </button>
                </div>

                <div className={METRICS_GRID}>
                  <span className="min-w-0 text-right text-base font-semibold tabular-nums text-text-primary sm:text-[17px]">
                    {formatTopicReach(topic)}
                  </span>
                  <span className="min-w-0 text-center text-base font-medium text-text-secondary sm:text-[17px]">
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
                    {savedTopics.has(topic.name) ? (
                      <TooltipCard
                        iconTrigger
                        title={TOOLTIPS.trending_topic_saved.title}
                        description={TOOLTIPS.trending_topic_saved.description}
                      >
                        <span
                          className="inline-flex rounded-lg p-1.5 text-emerald-400"
                          aria-label="Saved to ideas"
                        >
                          <Check size={18} aria-hidden />
                        </span>
                      </TooltipCard>
                    ) : (
                      <TooltipCard
                        iconTrigger
                        title={TOOLTIPS.trending_topic_save.title}
                        description={TOOLTIPS.trending_topic_save.description}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSave(topic);
                          }}
                          disabled={savingTopic === topic.name}
                          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-accent-surface hover:text-accent-text disabled:pointer-events-none"
                          aria-label="Save to ideas"
                        >
                          <Bookmark size={18} className={savingTopic === topic.name ? 'animate-pulse' : ''} />
                        </button>
                      </TooltipCard>
                    )}
                  </div>
                </div>
              </div>

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
