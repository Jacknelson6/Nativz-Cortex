import { ArrowBigUp, MessageCircle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { PlatformSource } from '@/lib/types/search';
import { formatCompactCount, formatRelativeTime } from '@/lib/utils/format';

const REDDIT_ORANGE = '#FF4500';

interface RedditScanSummaryCardProps {
  redditSources: PlatformSource[];
  completedAt: string | null;
}

function representativeQuote(src: PlatformSource): string | null {
  const byLikes = [...(src.comments ?? [])].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  const best = byLikes[0]?.text?.trim();
  const text = best || src.content?.trim() || '';
  if (!text) return null;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export function RedditScanSummaryCard({
  redditSources,
  completedAt,
}: RedditScanSummaryCardProps) {
  if (!redditSources.length) return null;

  const sorted = [...redditSources].sort(
    (a, b) => (b.engagement.score ?? 0) - (a.engagement.score ?? 0),
  );
  const top = sorted[0];

  const score = top.engagement.score ?? 0;
  const comments = top.engagement.comments ?? 0;
  const quote = representativeQuote(top);

  return (
    <Card padding="none" className="flex h-full flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: REDDIT_ORANGE }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
            Reddit
          </span>
          {top.subreddit ? (
            <span className="font-mono text-[10px] text-text-muted/70">
              · r/{top.subreddit.replace(/^r\//, '')}
            </span>
          ) : null}
        </div>
        {completedAt ? (
          <time
            dateTime={completedAt}
            className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted/80"
          >
            {formatRelativeTime(completedAt)}
          </time>
        ) : null}
      </header>

      <a
        href={top.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-lg leading-snug text-text-primary transition-colors hover:text-accent-text"
        style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif', fontWeight: 500 }}
      >
        {top.title || 'Untitled thread'}
      </a>

      <div className="flex items-center gap-4 text-xs tabular-nums text-text-muted/85">
        <span className="inline-flex items-center gap-1">
          <ArrowBigUp size={12} aria-hidden />
          {formatCompactCount(score)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={11} aria-hidden />
          {formatCompactCount(comments)}
        </span>
      </div>

      {quote ? (
        <blockquote className="mt-auto text-sm italic leading-snug text-text-secondary/85">
          <span
            aria-hidden
            className="mr-0.5 font-serif text-base text-text-muted/60"
          >
            “
          </span>
          {quote}
          <span
            aria-hidden
            className="ml-0.5 font-serif text-base text-text-muted/60"
          >
            ”
          </span>
        </blockquote>
      ) : null}
    </Card>
  );
}
