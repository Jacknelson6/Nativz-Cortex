'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Plus, Telescope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ContentLabSection } from '@/components/content-lab/content-lab-section';
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
  selectedId,
  onAttach,
}: {
  topicSearches: TopicSearchRow[];
  selectedId: string | null;
  onAttach: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(selectedId);

  const selectedSearch = useMemo(
    () => topicSearches.find((search) => search.id === selectedId) ?? null,
    [topicSearches, selectedId],
  );

  const openPicker = () => {
    const initialSelection = selectedId ?? topicSearches[0]?.id ?? null;
    setPendingId(initialSelection);
    setPickerOpen(true);
  };

  const confirmAttach = () => {
    if (!pendingId) return;
    onAttach(pendingId);
    setPickerOpen(false);
  };

  return (
    <ContentLabSection
      icon={Telescope}
      title="Topic search source"
      description="Attach one topic search to seed this strategy workspace. This selection is saved only in this browser."
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
        <div className="space-y-3">
          {selectedSearch ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                    Attached search
                  </p>
                  <p className="line-clamp-2 text-sm font-medium text-foreground">{selectedSearch.query}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadgeVariant(selectedSearch.status)} className="font-normal">
                      {statusLabel(selectedSearch.status)}
                    </Badge>
                    <time className="text-xs tabular-nums text-text-muted" dateTime={selectedSearch.created_at}>
                      {formatSearchTimestamp(selectedSearch.created_at)}
                    </time>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={openPicker}>
                    Replace
                  </Button>
                  <Link
                    href={`/admin/search/${selectedSearch.id}`}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                      'text-accent-text ring-1 ring-inset ring-accent/20 transition',
                      'hover:bg-accent-surface hover:ring-accent/35',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    )}
                  >
                    View details
                    <ExternalLink className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nativz-border/50 bg-background/30 px-4 py-3">
              <p className="text-sm text-text-muted">Bring in one topic search to seed this strategy workspace.</p>
              <Button size="sm" onClick={openPicker}>
                Attach topic search
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-dashed border-nativz-border/50 bg-background/20 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-secondary">Add another search</p>
              <p className="text-xs text-text-muted">Coming soon for multi-search strategy sessions.</p>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border/60 px-3 py-1.5 text-xs font-medium text-text-muted"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Coming soon
            </button>
          </div>
        </div>
      )}

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="Attach topic search" maxWidth="lg">
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Pick one topic search to seed this strategy session. You can replace it any time.
          </p>
          <ul
            className="max-h-80 overflow-y-auto rounded-xl border border-nativz-border/50 bg-background/25"
            aria-label="Topic searches to attach"
          >
            {topicSearches.map((search) => {
              const active = pendingId === search.id;
              return (
                <li key={search.id} className="border-b border-nativz-border/35 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setPendingId(search.id)}
                    className={cn(
                      'w-full px-3 py-3 text-left transition-colors',
                      active ? 'bg-accent-surface/25' : 'hover:bg-surface-hover/35',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">{search.query}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant={statusBadgeVariant(search.status)} className="font-normal">
                            {statusLabel(search.status)}
                          </Badge>
                          <time className="text-xs tabular-nums text-text-muted" dateTime={search.created_at}>
                            {formatSearchTimestamp(search.created_at)}
                          </time>
                        </div>
                      </div>
                      {active ? (
                        <span className="rounded-full border border-accent/40 bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">
                          Selected
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAttach} disabled={!pendingId}>
              Attach search
            </Button>
          </div>
        </div>
      </Dialog>
    </ContentLabSection>
  );
}
