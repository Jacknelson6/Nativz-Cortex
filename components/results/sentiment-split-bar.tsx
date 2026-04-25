'use client';

import { getSentimentLabel } from '@/lib/utils/sentiment';

// Uses the project's status tokens (status-success / status-danger) so the
// bar adapts to brand-mode theme swaps. Earlier revisions hard-coded
// emerald / red Tailwind scales, which read fine in default dark mode but
// broke under Anderson Collaborative and any future brand toggles.
export function SentimentSplitBar({ sentiment }: { sentiment: number }) {
  const pos = Math.max(0, Math.min(1, (sentiment + 1) / 2));
  const neg = 1 - pos;
  const posPercent = Math.round(pos * 100);
  const negPercent = Math.round(neg * 100);
  const label = getSentimentLabel(sentiment);
  const a11yLabel = `Sentiment: ${posPercent}% positive, ${negPercent}% negative — ${label}`;

  return (
    <div
      role="img"
      aria-label={a11yLabel}
      className="flex w-full min-w-[140px] max-w-[200px] shrink-0 items-center gap-2"
      title={label}
    >
      <span className="w-8 text-right text-xs tabular-nums text-status-success/90">{posPercent}%</span>
      <div className="flex h-2.5 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full">
        <div
          className="h-full min-w-[3px] rounded-l-full bg-status-success/85"
          style={{ width: `${pos * 100}%` }}
        />
        <div
          className="h-full min-w-[3px] rounded-r-full bg-status-danger/85"
          style={{ width: `${neg * 100}%` }}
        />
      </div>
      <span className="w-8 text-xs tabular-nums text-status-danger/90">{negPercent}%</span>
    </div>
  );
}
