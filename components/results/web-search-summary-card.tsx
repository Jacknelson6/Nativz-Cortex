import { Search } from 'lucide-react';

import { Card } from '@/components/ui/card';
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
// Kept as a narrow relevance signal for the quiet bar; we no longer
// render a percentage per row since the rank order already conveys it.
function rankRelevance(idx: number, total: number): number {
  if (total <= 1) return 95;
  return Math.round(95 - ((95 - 55) * idx) / (total - 1));
}

export function WebSearchSummaryCard({ query, completedAt, serpData }: WebSearchSummaryCardProps) {
  const results = serpData.webResults ?? [];
  if (results.length === 0) return null;

  const preview = results.slice(0, 4);
  const avg = Math.round(
    results
      .map((_, i) => rankRelevance(i, results.length))
      .reduce((s, r) => s + r, 0) / results.length,
  );

  return (
    <Card padding="none" className="flex h-full flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1 w-1 rounded-full bg-accent/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
            Web
          </span>
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

      <div className="flex items-start gap-2">
        <Search size={14} className="mt-0.5 shrink-0 text-text-muted/80" aria-hidden />
        <p
          className="min-w-0 text-lg leading-snug text-text-primary"
          style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif', fontWeight: 500 }}
          title={query}
        >
          {query}
        </p>
      </div>

      <ul className="space-y-1.5">
        {preview.map((r, i) => (
          <li
            key={`${r.url}-${i}`}
            className="flex items-center gap-3 text-sm"
          >
            <span
              aria-hidden
              className="inline-block h-1 w-1 shrink-0 rounded-full bg-accent/50"
            />
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-text-secondary transition-colors hover:text-accent-text"
              title={r.url}
            >
              {domainFrom(r.url)}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono uppercase tracking-[0.18em] text-text-muted/80">
            Relevance
          </span>
          <span className="tabular-nums text-text-secondary">{avg}%</span>
        </div>
        <div className="h-px w-full bg-nativz-border/60">
          <div
            className="h-px bg-accent/70 transition-all"
            style={{ width: `${avg}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
