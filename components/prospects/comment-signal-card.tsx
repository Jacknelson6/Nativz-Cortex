'use client';

// SPY-03 T17: comment-signal card.
// Reuses the existing SentimentSplitBar (emerald/red carve-out from
// memory/feedback_sentiment_bar_colors.md — Jack confirmed green+red
// beats brand tokens for sentiment legibility).

import { SentimentSplitBar } from '@/components/results/sentiment-split-bar';
import type { CommentSignal } from '@/lib/prospects/types';

interface Props {
  signal: CommentSignal | null;
}

export function CommentSignalCard({ signal }: Props) {
  if (!signal) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        Comment analysis pending.
      </div>
    );
  }

  const replyPct = Math.round((signal.reply_rate ?? 0) * 100);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Comment signal</h3>
        <SentimentSplitBar sentiment={signal.sentiment_score} />
      </div>
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-text-muted">Recurring themes</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(signal.recurring_themes ?? []).length === 0 ? (
              <span className="text-text-muted">None detected</span>
            ) : (
              signal.recurring_themes.map((t, i) => (
                <span
                  key={`${i}-${t}`}
                  className="rounded-full bg-background px-2 py-0.5 text-foreground"
                >
                  {t}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-text-muted">Reply rate</span>
          <span className="font-medium tabular-nums text-foreground">{replyPct}%</span>
        </div>
        {signal.note && <p className="text-text-muted">{signal.note}</p>}
      </div>
    </div>
  );
}
