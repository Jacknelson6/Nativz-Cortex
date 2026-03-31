'use client';

import {
  TrendingUp,
  Flame,
} from 'lucide-react';

interface KeyFindingsProps {
  summary: string;
  topics: { name: string; resonance: string; sentiment: number }[];
  overallSentiment?: number;
}

export function KeyFindings({ summary, topics, overallSentiment }: KeyFindingsProps) {
  if (!summary && topics.length === 0) return null;

  // Quick stats from topics
  const avgSentiment = topics.length > 0
    ? topics.reduce((sum, t) => sum + t.sentiment, 0) / topics.length
    : 0;
  const sentiment = overallSentiment ?? avgSentiment;
  const sentimentLabel =
    sentiment >= 0.6 ? 'Positive' :
    sentiment >= 0.2 ? 'Leaning positive' :
    sentiment > -0.2 ? 'Neutral' :
    sentiment > -0.6 ? 'Leaning negative' :
    'Negative';
  const sentimentColor =
    sentiment >= 0.6 ? 'text-emerald-400' :
    sentiment >= 0.2 ? 'text-emerald-300' :
    sentiment > -0.2 ? 'text-zinc-400' :
    sentiment > -0.6 ? 'text-red-300' :
    'text-red-400';

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
