'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SentimentBadgeProps {
  sentiment: number; // -1 to 1
  size?: 'sm' | 'md';
}

export function SentimentBadge({ sentiment, size = 'sm' }: SentimentBadgeProps) {
  const isPositive = sentiment > 0.15;
  const isNegative = sentiment < -0.15;

  const label = isPositive ? 'Positive' : isNegative ? 'Negative' : 'Neutral';
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  const colors = isPositive
    ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
    : isNegative
    ? 'bg-red-500/15 text-red-400 ring-red-500/20'
    : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';

  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full ring-1 ring-inset font-medium ${colors} ${px}`}>
      <Icon size={size === 'sm' ? 10 : 12} />
      {label}
    </span>
  );
}
