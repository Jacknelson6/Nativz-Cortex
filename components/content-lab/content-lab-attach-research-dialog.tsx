'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, FileText, Loader2, Search as SearchIcon, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

interface TopicSearchItem {
  id: string;
  query: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  search_mode: string | null;
  platforms: string[] | null;
  volume: string | null;
  metrics: { trending_topics_count?: number; topic_score?: number } | null;
}

interface AttachResearchDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientSlug: string;
  attachedSearchIds: string[];
  onToggle: (searchId: string) => void;
}

/**
 * Modal dialog that replaces the tiny cramped popover — lets users see every
 * topic search for this client at a glance, filter by query, and toggle
 * attachment with a single click. Visible confirmation via the check icon
 * + selected count in the footer.
 */
export function ContentLabAttachResearchDialog({
  open,
  onClose,
  clientId,
  clientName,
  clientSlug,
  attachedSearchIds,
  onToggle,
}: AttachResearchDialogProps) {
  const [searches, setSearches] = useState<TopicSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    async function loadSearches() {
      setLoading(true);
      try {
        const r = await fetch(`/api/nerd/searches?clientId=${clientId}`);
        const data = await r.json();
        if (!cancelled) setSearches((data.searches ?? []) as TopicSearchItem[]);
      } catch {
        if (!cancelled) setSearches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSearches();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const completed = useMemo(
    () => searches.filter((s) => s.status === 'completed'),
    [searches],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return completed;
    return completed.filter((s) => s.query.toLowerCase().includes(q));
  }, [completed, filter]);

  const attachedSet = useMemo(() => new Set(attachedSearchIds), [attachedSearchIds]);
  const attachedCount = attachedSet.size;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-nativz-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <FileText size={16} className="text-accent-text" aria-hidden />
              Attach topic research
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Ground the Nerd in {clientName}&apos;s topic searches — multiple can be attached at once.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter input */}
        <div className="border-b border-nativz-border px-5 py-3">
          <div className="relative">
            <SearchIcon
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by query…"
              className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/40 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 size={18} className="animate-spin text-text-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover/60">
                <Sparkles size={18} className="text-text-muted" />
              </div>
              <p className="text-sm font-medium text-text-secondary">
                {filter ? 'No matching searches' : 'No completed topic searches yet'}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {filter
                  ? 'Try a different query'
                  : 'Run a topic search to get trending content ideas.'}
              </p>
              {!filter && (
                <Link
                  href={`/admin/research?clientId=${clientId}`}
                  onClick={onClose}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text transition hover:bg-accent/20"
                >
                  <Sparkles size={12} />
                  Run a topic search
                </Link>
              )}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const attached = attachedSet.has(s.id);
                const topicCount = s.metrics?.trending_topics_count ?? null;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(s.id)}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition',
                        attached ? 'bg-accent/10 hover:bg-accent/15' : 'hover:bg-surface-hover/60',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                          attached
                            ? 'border-accent bg-accent text-white'
                            : 'border-nativz-border bg-surface',
                        )}
                      >
                        {attached && <Check size={10} strokeWidth={3} aria-hidden />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-medium', attached ? 'text-text-primary' : 'text-text-primary')}>
                          {s.query}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={10} />
                            {formatRelativeTime(s.completed_at ?? s.created_at)}
                          </span>
                          {topicCount != null && (
                            <span>{topicCount} topics</span>
                          )}
                          {s.platforms && s.platforms.length > 0 && (
                            <span className="truncate">{s.platforms.join(' · ')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-nativz-border bg-surface-hover/30 px-5 py-3 text-xs">
          <span className="text-text-muted">
            {attachedCount} attached · {completed.length} available
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 font-medium text-accent-text transition hover:bg-accent/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
