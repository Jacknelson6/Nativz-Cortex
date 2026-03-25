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

/** Matches mockup: topic | total views | resonance | sentiment | save */
const GRID =
  'grid-cols-[minmax(0,1fr)_minmax(88px,0.95fr)_minmax(72px,0.75fr)_minmax(88px,0.85fr)_40px]';

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
  return (
    <div
      className="flex h-2 w-[72px] shrink-0 gap-0.5 overflow-hidden rounded-full"
      title={getSentimentLabel(sentiment)}
    >
      <div className="h-full min-w-[3px] rounded-l-full bg-red-500/85" style={{ width: `${neg * 100}%` }} />
      <div className="h-full min-w-[3px] rounded-r-full bg-emerald-500/85" style={{ width: `${pos * 100}%` }} />
    </div>
  );
}

function TopicTitleCell({ name, index }: { name: string; index: number }) {
  const leading = name.match(/^(\p{Extended_Pictographic})\s*/u);
  const emoji = leading?.[1];
  const label = emoji ? name.slice(leading![0].length) : name;
  const displayEmoji = emoji ?? TOPIC_FALLBACK_EMOJI[index % TOPIC_FALLBACK_EMOJI.length];

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-base leading-none shrink-0" aria-hidden>
        {displayEmoji}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{label}</span>
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
      className={`flex w-full items-center justify-end gap-1 transition-colors hover:text-text-secondary ${
        isActive ? 'text-text-secondary' : 'text-text-muted'
      }`}
    >
      {tooltip ? (
        <TooltipCard title={tooltip.title} description={tooltip.description}>
          <span className="text-xs font-medium normal-case">{label}</span>
        </TooltipCard>
      ) : (
        <span className="text-xs font-medium normal-case">{label}</span>
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

  async function copyTopicTitle(topic: TrendingTopic | LegacyTrendingTopic) {
    try {
      await navigator.clipboard.writeText(topic.name);
      toast.success('Copied topic');
    } catch {
      toast.error('Could not copy');
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
      <div className="border-b border-nativz-border px-5 py-3 sm:px-6">
        <div className={`grid ${GRID} gap-3 items-end`}>
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Trending topics</span>
          <SortHeader
            label="Total views"
            sortKey="reach"
            activeKey={sortKey}
            activeDir={sortDir}
            onSort={handleSort}
            tooltip={TOOLTIPS.total_views}
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
          <span className="block w-10" aria-hidden />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {sortedTopics.map((topic, i) => (
            <div key={topic.name} className="animate-stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
              <div
                className={`grid ${GRID} gap-3 items-center border-b border-nativz-border/80 px-5 py-3.5 last:border-b-0 sm:px-6 transition-colors hover:bg-surface-hover/60`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expandedIndex === i}
                  >
                    {expandedIndex === i ? (
                      <ChevronDown size={16} className="shrink-0 text-text-muted" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-text-muted" />
                    )}
                    <TopicTitleCell name={topic.name} index={i} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyTopicTitle(topic)}
                    className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                    title="Copy topic title"
                    aria-label="Copy topic title"
                  >
                    <Copy size={14} />
                  </button>
                </div>

                <span className="text-right text-sm font-semibold tabular-nums text-text-primary">
                  {formatTopicReach(topic)}
                </span>
                <span className="text-right text-sm font-medium text-text-secondary">
                  {RESONANCE_LABEL[topic.resonance] ?? topic.resonance}
                </span>
                <div className="flex justify-end">
                  <SentimentSplitBar sentiment={topic.sentiment} />
                </div>
                <span className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSave(topic);
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
      </div>
    </Card>
  );
}
