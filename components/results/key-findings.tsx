'use client';

import {
  TrendingUp,
  MessageCircle,
  Flame,
  Users,
  Hash,
} from 'lucide-react';

interface KeyFindingsProps {
  summary: string;
  topics: { name: string; resonance: string; sentiment: number }[];
}

export function KeyFindings({ summary, topics }: KeyFindingsProps) {
  if (!summary && topics.length === 0) return null;

  // Quick stats from topics
  const viralCount = topics.filter(t => t.resonance === 'viral').length;
  const highCount = topics.filter(t => t.resonance === 'high').length;
  const avgSentiment = topics.length > 0
    ? topics.reduce((sum, t) => sum + t.sentiment, 0) / topics.length
    : 0;
  const sentimentLabel = avgSentiment > 0.3 ? 'Positive' : avgSentiment < -0.3 ? 'Negative' : 'Mixed';
  const sentimentColor = avgSentiment > 0.3 ? 'text-emerald-400' : avgSentiment < -0.3 ? 'text-red-400' : 'text-amber-400';

  // Top trending topics as chips
  const topTopics = topics
    .sort((a, b) => {
      const order = { viral: 4, high: 3, medium: 2, low: 1 };
      return (order[b.resonance as keyof typeof order] ?? 0) - (order[a.resonance as keyof typeof order] ?? 0);
    })
    .slice(0, 5);

  const resonanceColors: Record<string, string> = {
    viral: 'bg-red-500/10 text-red-400 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };

  return (
    <div className="space-y-4">
      {/* Quick stat chips */}
      <div className="flex flex-wrap gap-3">
        {topics.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Hash size={12} className="text-accent-text" />
            <span className="text-text-primary font-medium">{topics.length}</span> trending topics
          </div>
        )}
        {(viralCount + highCount) > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Flame size={12} className="text-orange-400" />
            <span className="text-text-primary font-medium">{viralCount + highCount}</span> high-resonance
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <TrendingUp size={12} className={sentimentColor} />
          Sentiment: <span className={`font-medium ${sentimentColor}`}>{sentimentLabel}</span>
        </div>
      </div>

      {/* Top topics as compact chips */}
      {topTopics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topTopics.map((topic) => (
            <span
              key={topic.name}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${resonanceColors[topic.resonance] ?? resonanceColors.low}`}
            >
              {topic.resonance === 'viral' && <Flame size={10} />}
              {topic.resonance === 'high' && <TrendingUp size={10} />}
              {topic.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
