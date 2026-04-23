'use client';

import { getSentimentLabel } from '@/lib/utils/sentiment';

// Brand palette: cyan = positive signal, coral = negative signal.
// Replaces the off-brand emerald/red combo per the "kill banned border-l
// stripes + stats-row accent drift" cleanup pass.
export function SentimentSplitBar({ sentiment }: { sentiment: number }) {
  const pos = Math.max(0, Math.min(1, (sentiment + 1) / 2));
  const neg = 1 - pos;
  const posPercent = Math.round(pos * 100);
  const negPercent = Math.round(neg * 100);
  return (
    <div
      className="flex shrink-0 items-center gap-2 tabular-nums"
      title={getSentimentLabel(sentiment)}
    >
      <span className="w-8 text-right text-xs text-cyan-300/90">{posPercent}%</span>
      <div className="flex h-2 w-[76px] gap-0.5 overflow-hidden rounded-full bg-nativz-border/40 sm:w-[84px]">
        <div
          className="h-full min-w-[3px] rounded-l-full bg-cyan-400/85"
          style={{ width: `${pos * 100}%` }}
        />
        <div
          className="h-full min-w-[3px] rounded-r-full bg-coral-400/85"
          style={{ width: `${neg * 100}%` }}
        />
      </div>
      <span className="w-8 text-xs text-coral-300/90">{negPercent}%</span>
    </div>
  );
}
