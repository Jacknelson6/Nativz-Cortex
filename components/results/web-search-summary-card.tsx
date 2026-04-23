'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, Globe, Search } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SerpData } from '@/lib/serp/types';
import { formatRelativeTime } from '@/lib/utils/format';

interface WebSearchSummaryCardProps {
  query: string;
  completedAt: string | null;
  serpData: SerpData;
}

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// SERP position is already a relevance ranking; map rank → 95..55%.
function rankRelevance(idx: number, total: number): number {
  if (total <= 1) return 95;
  return Math.round(95 - ((95 - 55) * idx) / (total - 1));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

export function WebSearchSummaryCard({ query, completedAt, serpData }: WebSearchSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const results = serpData.webResults ?? [];
  if (results.length === 0) return null;

  const scored = results.map((r, i) => ({
    url: r.url,
    title: stripHtml(r.title || ''),
    score: rankRelevance(i, results.length),
  }));
  const preview = scored.slice(0, 4);
  const moreCount = Math.max(0, results.length - preview.length);
  const avg = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);

  return (
    <Card padding="none" className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
          <Globe size={11} aria-hidden />
          Web search
        </span>
        {completedAt ? (
          <time dateTime={completedAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">
            {formatRelativeTime(completedAt)}
          </time>
        ) : null}
      </header>

      <div className="flex items-center gap-2 rounded-lg border border-nativz-border-light bg-background/60 px-3 py-2">
        <Search size={13} className="shrink-0 text-text-muted" aria-hidden />
        <span className="min-w-0 truncate text-sm text-text-primary" title={query}>{query}</span>
      </div>

      <p className="text-xs text-text-muted">
        {results.length} web {results.length === 1 ? 'page' : 'pages'} analyzed
        {completedAt ? ` · ${formatRelativeTime(completedAt)}` : ''}
      </p>

      <ul className="space-y-1.5">
        {preview.map((r, i) => (
          <li key={`${r.url}-${i}`} className="flex items-center justify-between gap-3 text-sm">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-text-secondary hover:text-accent-text hover:underline"
              title={r.title || r.url}
            >
              {domainFrom(r.url)}
            </a>
            <span className="shrink-0 tabular-nums text-xs font-semibold text-sky-300">{r.score}%</span>
          </li>
        ))}
      </ul>

      {moreCount > 0 ? (
        <p className="text-xs text-text-muted">+ {moreCount} more {moreCount === 1 ? 'result' : 'results'}</p>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Avg. relevance</span>
          <span className="tabular-nums font-semibold text-text-secondary">{avg}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-nativz-border-light">
          <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${avg}%` }} />
        </div>
      </div>

      {expanded ? (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto border-t border-nativz-border-light pt-3">
          {scored.slice(4).map((r, i) => (
            <li key={`more-${r.url}-${i}`} className="flex items-center justify-between gap-3 text-sm">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-text-secondary hover:text-accent-text hover:underline"
                title={r.title || r.url}
              >
                {domainFrom(r.url)}
              </a>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-xs font-semibold text-sky-300">{r.score}%</span>
                <ExternalLink size={11} className="text-text-muted" aria-hidden />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {results.length > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-auto inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 py-2 text-sm font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
        >
          {expanded ? 'Hide details' : 'Open details'}
          <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      ) : null}
    </Card>
  );
}
