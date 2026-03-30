'use client';

import Link from 'next/link';
import { Check, ExternalLink, Telescope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StrategyLabSection } from '@/components/strategy-lab/strategy-lab-section';
import { cn } from '@/lib/utils/cn';

export type TopicSearchRow = {
  id: string;
  query: string;
  status: string;
  created_at: string;
};

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'processing':
    case 'pending':
      return 'In progress';
    case 'pending_subtopics':
      return 'Planning';
    default:
      return status;
  }
}

function statusBadgeVariant(
  status: string,
): 'success' | 'danger' | 'warning' | 'info' | 'mono' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'processing':
    case 'pending':
      return 'warning';
    case 'pending_subtopics':
      return 'info';
    default:
      return 'mono';
  }
}

function formatSearchTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function TopicSearchSelectionCard({
  topicSearches,
  selectedIds,
  onToggle,
}: {
  topicSearches: TopicSearchRow[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const selectedCount = selectedIds.size;

  return (
    <StrategyLabSection
      icon={Telescope}
      title="Topic searches in this workspace"
      description="Choose which topic search runs to include in this strategy session. Your selection is saved only in this browser."
    >
      {topicSearches.length === 0 ? (
        <p className="text-sm text-text-muted">
          No topic searches for this client yet.{' '}
          <Link href="/admin/search/new" className="text-accent-text underline-offset-4 hover:underline">
            Start a topic search
          </Link>{' '}
          and attach this client.
        </p>
      ) : (
        <ul
          className="max-h-80 overflow-y-auto rounded-xl border border-nativz-border/50 bg-background/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
          aria-label="Topic searches to include"
        >
          {topicSearches.map((t) => {
            const checked = selectedIds.has(t.id);
            const inputId = `ts-${t.id}`;
            return (
              <li key={t.id} className="border-b border-nativz-border/35 last:border-b-0">
                <div
                  className={cn(
                    'flex items-stretch gap-2 px-2 py-1 sm:gap-3 sm:px-3 sm:py-2',
                    checked ? 'bg-accent-surface/20' : 'hover:bg-surface-hover/35',
                  )}
                >
                  <label
                    htmlFor={inputId}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2 pl-1"
                  >
                    <span className="relative flex shrink-0 pt-0.5">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(t.id)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors',
                          checked
                            ? 'border-accent bg-accent text-white shadow-sm'
                            : 'border-nativz-border bg-background peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
                        )}
                        aria-hidden
                      >
                        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-left text-sm font-medium leading-snug text-foreground">
                        {t.query}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge variant={statusBadgeVariant(t.status)} className="font-normal">
                          {statusLabel(t.status)}
                        </Badge>
                        <time className="text-xs tabular-nums text-text-muted" dateTime={t.created_at}>
                          {formatSearchTimestamp(t.created_at)}
                        </time>
                      </span>
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center pr-1">
                    <Link
                      href={`/admin/search/${t.id}`}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium',
                        'text-accent-text ring-1 ring-inset ring-accent/20 transition',
                        'hover:bg-accent-surface hover:ring-accent/35',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      )}
                    >
                      Open
                      <ExternalLink className="h-3.5 w-3.5 opacity-90" aria-hidden />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {topicSearches.length > 0 && (
        <div
          className={cn(
            'mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
            selectedCount === 0
              ? 'border-nativz-border/50 bg-background/40 text-text-muted'
              : 'border-emerald-500/25 bg-emerald-500/5 text-foreground',
          )}
        >
          <span
            className={cn(
              'mt-1.5 h-2 w-2 shrink-0 rounded-full',
              selectedCount === 0 ? 'bg-nativz-border' : 'bg-emerald-400',
            )}
            aria-hidden
          />
          <p>
            {selectedCount === 0
              ? 'Select at least one search to continue in the next step of the strategy lab.'
              : `${selectedCount} search${selectedCount === 1 ? '' : 'es'} will be merged into this strategy session.`}
          </p>
        </div>
      )}
    </StrategyLabSection>
  );
}
