'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, X, Plus, Check, Loader2, Search as SearchIcon, Clock } from 'lucide-react';
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

interface StrategyLabTopicSearchChipBarProps {
  clientId: string;
  clientName: string;
  attachedSearchIds: string[];
  onToggle: (searchId: string) => void;
  /**
   * Initial attached set from the Strategy Lab selection storage — on mount
   * we merge this into attachedSearchIds if the user hasn't manually picked
   * anything yet. Lets the Research page's "Bring to Strategy Lab" flow
   * pre-attach the pinned searches.
   */
  pinnedTopicSearchIds: string[];
  /**
   * When no pinned IDs are set on first load, auto-attach the latest
   * completed search so the chat is never cold-started.
   */
  autoAttachLatest?: boolean;
  /**
   * Bumped by the parent to force a refetch — not strictly needed today but
   * cheap to wire and future-proofs against pickers that add searches from
   * outside this component.
   */
  refreshToken?: number;
  /**
   * Lifts the client searches list to the parent so the PDF export has the
   * query text + timestamps it needs to render the research-grounding block.
   */
  onSearchesLoaded?: (searches: TopicSearchItem[]) => void;
}

/**
 * Compact research-attachment UI that lives above the chat input. Replaces
 * the old left rail pattern — the user wants the rail to show conversation
 * history instead, so attachment had to move somewhere else.
 *
 * Layout:
 *   📄 RESEARCH  [Chip: Spring launch ×]  [Chip: SEO trends ×]  [+ Add]
 *
 * Click + Add → dropdown listing every completed topic search for this
 * client; click a row to toggle attached/not. Same data source as the old
 * rail, same toggle semantics, just folded into a smaller surface so the
 * chat reading area gets the full width.
 */
export function StrategyLabTopicSearchChipBar({
  clientId,
  clientName,
  attachedSearchIds,
  onToggle,
  pinnedTopicSearchIds,
  autoAttachLatest = true,
  refreshToken,
  onSearchesLoaded,
}: StrategyLabTopicSearchChipBarProps) {
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasAutoAttachedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Load this client's searches so the chip labels + picker work.
  useEffect(() => {
    if (!clientId) {
      setClientSearches([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/nerd/searches?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const fetched = (data.searches ?? []) as TopicSearchItem[];
        setClientSearches(fetched);
        onSearchesLoaded?.(fetched);

        // Seed attached set from pinned list or auto-attach latest.
        if (!hasAutoAttachedRef.current && attachedSearchIds.length === 0) {
          hasAutoAttachedRef.current = true;
          if (pinnedTopicSearchIds.length > 0) {
            for (const id of pinnedTopicSearchIds) onToggle(id);
          } else if (autoAttachLatest) {
            const latest = fetched.find((s) => s.status === 'completed');
            if (latest) onToggle(latest.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setClientSearches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onToggle + attachedSearchIds deliberately excluded — we only want to
    // auto-attach once on initial mount, not re-attach when the user
    // detaches a search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshToken]);

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [pickerOpen]);

  const attachedSearches = useMemo(
    () =>
      attachedSearchIds
        .map((id) => clientSearches.find((s) => s.id === id))
        .filter((s): s is TopicSearchItem => !!s),
    [attachedSearchIds, clientSearches],
  );

  const completedSearches = useMemo(
    () => clientSearches.filter((s) => s.status === 'completed'),
    [clientSearches],
  );

  return (
    <div className="flex shrink-0 items-center gap-2 px-1 pb-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted/70">
        <FileText size={11} aria-hidden />
        Research
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {attachedSearches.length === 0 ? (
          <span className="text-[11px] text-text-muted/50">
            {loading && attachedSearchIds.length > 0 ? 'Loading…' : 'Nothing attached'}
          </span>
        ) : (
          attachedSearches.map((s) => (
            <span
              key={s.id}
              className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-nativz-border/60 bg-surface-hover/50 pl-2.5 pr-1 py-0.5 text-[11px] text-text-secondary"
            >
              <span className="truncate" title={s.query}>
                {s.query}
              </span>
              <button
                type="button"
                onClick={() => onToggle(s.id)}
                className="cursor-pointer rounded-full p-0.5 text-text-muted/70 hover:bg-surface-hover hover:text-text-primary"
                aria-label={`Remove ${s.query} from context`}
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
      </div>
      <div ref={panelRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
            pickerOpen
              ? 'border-nativz-border bg-surface-hover text-text-primary'
              : 'border-nativz-border/60 text-text-muted hover:border-nativz-border hover:bg-surface-hover/60 hover:text-text-primary',
          )}
        >
          <Plus size={11} />
          Add research
        </button>
        {pickerOpen && (
          <div className="absolute right-0 bottom-full z-30 mb-1.5 w-[340px] overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-elevated">
            <div className="flex items-center justify-between border-b border-nativz-border/60 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {clientName}
              </span>
              <span className="text-[10px] text-text-muted/70">
                {attachedSearchIds.length} of {completedSearches.length} attached
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {loading ? (
                <div className="space-y-1.5 p-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-hover" />
                  ))}
                </div>
              ) : completedSearches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
                  <SearchIcon size={16} className="text-text-muted/40" />
                  <p className="text-xs text-text-muted">No completed searches yet</p>
                  <p className="text-[11px] text-text-muted/60">
                    Run a topic search for {clientName} to attach it here.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {completedSearches.map((s) => {
                    const isAttached = attachedSearchIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onToggle(s.id)}
                        className={cn(
                          'group flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                          isAttached
                            ? 'border-nativz-border bg-surface-hover'
                            : 'border-transparent hover:bg-surface-hover/60',
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isAttached ? (
                            <Check size={12} className="text-text-primary" />
                          ) : (
                            <div className="h-3 w-3 rounded-full border border-text-muted/30 group-hover:border-text-muted/60" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-xs leading-snug',
                              isAttached ? 'font-medium text-text-primary' : 'text-text-secondary',
                            )}
                          >
                            {s.query}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="flex items-center gap-0.5 text-[10px] text-text-muted/50">
                              <Clock size={8} />
                              {formatRelativeTime(s.created_at)}
                            </span>
                            {s.metrics?.topic_score != null && (
                              <span className="text-[10px] text-text-muted/50">
                                Score {s.metrics.topic_score}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {loading && attachedSearches.length === 0 && (
          <Loader2 size={11} className="ml-2 inline-block animate-spin text-text-muted/50" aria-hidden />
        )}
      </div>
    </div>
  );
}
