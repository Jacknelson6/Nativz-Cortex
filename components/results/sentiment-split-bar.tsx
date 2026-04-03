'use client';

import { getSentimentLabel } from '@/lib/utils/sentiment';

export function SentimentSplitBar({ sentiment }: { sentiment: number }) {
  const pos = Math.max(0, Math.min(1, (sentiment + 1) / 2));
  const neg = 1 - pos;
  const posPercent = Math.round(pos * 100);
  const negPercent = Math.round(neg * 100);
  return (
    <div className="flex shrink-0 items-center gap-2" title={getSentimentLabel(sentiment)}>
      <span className="w-8 text-right text-xs tabular-nums text-emerald-400/90">{posPercent}%</span>
      <div className="flex h-2.5 w-[76px] gap-0.5 overflow-hidden rounded-full sm:w-[84px]">
        <div className="h-full min-w-[3px] rounded-l-full bg-emerald-500/85" style={{ width: `${pos * 100}%` }} />
        <div className="h-full min-w-[3px] rounded-r-full bg-red-500/85" style={{ width: `${neg * 100}%` }} />
      </div>
      <span className="w-8 text-xs tabular-nums text-red-400/90">{negPercent}%</span>
    </div>
  );
}
