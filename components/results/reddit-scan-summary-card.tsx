'use client';

import { useState } from 'react';
import { ArrowBigUp, ChevronDown, ExternalLink, MessageCircle, MessagesSquare } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PlatformSource } from '@/lib/types/search';
import { formatCompactCount, formatRelativeTime } from '@/lib/utils/format';

const REDDIT_ORANGE = '#FF4500';

interface RedditScanSummaryCardProps {
  redditSources: PlatformSource[];
  completedAt: string | null;
}

function activityLevel(score: number, comments: number): { label: string; tone: 'high' | 'active' | 'moderate' | 'quiet' } {
  const signal = score + comments * 2;
  if (signal >= 200) return { label: 'High activity', tone: 'high' };
  if (signal >= 80) return { label: 'Active', tone: 'active' };
  if (signal >= 20) return { label: 'Moderate', tone: 'moderate' };
  return { label: 'Quiet', tone: 'quiet' };
}

function representativeQuote(src: PlatformSource): string | null {
  const byLikes = [...(src.comments ?? [])].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  const best = byLikes[0]?.text?.trim();
  const text = best || src.content?.trim() || '';
  if (!text) return null;
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

export function RedditScanSummaryCard({ redditSources, completedAt }: RedditScanSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  if (!redditSources.length) return null;

  const sorted = [...redditSources].sort(
    (a, b) => (b.engagement.score ?? 0) - (a.engagement.score ?? 0),
  );
  const top = sorted[0];
  const others = sorted.slice(1);

  const score = top.engagement.score ?? 0;
  const comments = top.engagement.comments ?? 0;
  const activity = activityLevel(score, comments);
  const quote = representativeQuote(top);

  const toneClasses: Record<typeof activity.tone, string> = {
    high: 'bg-green-500/15 text-green-400',
    active: 'bg-sky-500/15 text-sky-300',
    moderate: 'bg-amber-500/15 text-amber-300',
    quiet: 'bg-text-muted/15 text-text-muted',
  };

  return (
    <Card padding="none" className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: `${REDDIT_ORANGE}26`, color: REDDIT_ORANGE }}
        >
          <MessagesSquare size={11} aria-hidden />
          Reddit scan
        </span>
        {completedAt ? (
          <time dateTime={completedAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">
            {formatRelativeTime(completedAt)}
          </time>
        ) : null}
      </header>

      {top.subreddit ? (
        <p className="text-xs font-semibold text-text-muted">r/{top.subreddit.replace(/^r\//, '')}</p>
      ) : null}

      <a
        href={top.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-semibold leading-snug text-text-primary hover:text-accent-text hover:underline"
      >
        {top.title || 'Untitled thread'}
      </a>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ArrowBigUp size={13} aria-hidden />
          {formatCompactCount(score)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={12} aria-hidden />
          {formatCompactCount(comments)}
        </span>
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', toneClasses[activity.tone])}>
          {activity.label}
        </span>
      </div>

      {quote ? (
        <blockquote
          className="rounded-lg border-l-2 bg-background/50 px-3 py-2 text-sm italic leading-snug text-text-secondary"
          style={{ borderLeftColor: REDDIT_ORANGE }}
        >
          &ldquo;{quote}&rdquo;
        </blockquote>
      ) : null}

      <p className="mt-auto text-xs text-text-muted">
        {redditSources.length} {redditSources.length === 1 ? 'thread' : 'threads'} analyzed
        {completedAt ? ` · ${formatRelativeTime(completedAt)}` : ''}
      </p>

      {expanded && others.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-nativz-border-light pt-3">
          {others.map((s) => (
            <li key={`${s.platform}:${s.id}`} className="flex items-start justify-between gap-3 text-sm">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 text-text-secondary hover:text-accent-text hover:underline"
                title={s.title}
              >
                <span className="line-clamp-2">{s.title || 'Untitled thread'}</span>
                {s.subreddit ? (
                  <span className="mt-0.5 block text-xs text-text-muted">r/{s.subreddit.replace(/^r\//, '')}</span>
                ) : null}
              </a>
              <div className="flex shrink-0 items-center gap-2 pt-0.5 text-xs tabular-nums text-text-muted">
                <span className="inline-flex items-center gap-0.5">
                  <ArrowBigUp size={12} aria-hidden />
                  {formatCompactCount(s.engagement.score ?? 0)}
                </span>
                <ExternalLink size={11} aria-hidden />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {others.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 py-2 text-sm font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
        >
          {expanded ? 'Hide details' : 'Open details'}
          <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      ) : null}
    </Card>
  );
}
