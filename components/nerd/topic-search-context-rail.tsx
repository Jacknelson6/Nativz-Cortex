'use client';

import { useState, useEffect, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

const STORAGE_KEY = 'cortex:nerd-search-rail-open';

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

interface TopicSearchContextRailProps {
  clientId: string | null;
  clientName: string | null;
  attachedSearchIds: string[];
  onToggleSearch: (searchId: string) => void;
}

export function TopicSearchContextRail({
  clientId,
  clientName,
  attachedSearchIds,
  onToggleSearch,
}: TopicSearchContextRailProps) {
  const [open, setOpen] = useRailOpen();
  const [searches, setSearches] = useState<TopicSearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setSearches([]);
      return;
    }
    let cancelled = false;
    async function loadSearches() {
      setLoading(true);
      try {
        const r = await fetch(`/api/nerd/searches?clientId=${clientId}`);
        const data = await r.json();
        if (!cancelled) setSearches(data.searches ?? []);
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
  }, [clientId]);

  const completedSearches = searches.filter((s) => s.status === 'completed');

  return (
    <div
      className={cn(
        'hidden min-h-0 shrink-0 flex-col overflow-hidden border-nativz-border lg:flex lg:h-full',
        open
          ? 'w-[260px] border-r bg-surface/50'
          : 'w-10 border-r border-nativz-border/50 bg-surface/30',
      )}
    >
      {!open ? (
        <div className="flex h-full min-h-0 flex-col items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            title="Open search context"
          >
            <PanelLeftOpen size={15} />
          </button>
          <div className="min-h-0 flex-1" />
          <span className="select-none text-[10px] text-text-muted/30 [writing-mode:vertical-lr] rotate-180">
            Research
          </span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-nativz-border/50 px-3 py-3">
            <span className="text-xs font-semibold text-text-primary">Research</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer text-text-muted transition-colors hover:text-text-secondary"
              title="Close sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-1.5 pb-3">
            {!clientId ? (
              <div className="flex flex-col items-center justify-center py-12 px-3 text-center">
                <Search size={18} className="mb-2 text-text-muted/30" />
                <p className="text-xs text-text-muted">Use @mention to select a client</p>
                <p className="text-[10px] text-text-muted/50 mt-1">Their topic searches will appear here</p>
              </div>
            ) : loading ? (
              <div className="space-y-1.5 p-1.5 mt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-surface-elevated animate-pulse" />
                ))}
              </div>
            ) : completedSearches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-3 text-center">
                <Search size={18} className="mb-2 text-text-muted/30" />
                <p className="text-xs text-text-muted">No completed searches</p>
                <p className="text-[10px] text-text-muted/50 mt-1">
                  {clientName ?? 'This client'} has no topic searches yet
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-0.5">
                <p className="text-[10px] font-medium text-text-muted/60 uppercase tracking-wide px-1.5 mb-1">
                  {clientName} — {completedSearches.length} search{completedSearches.length !== 1 ? 'es' : ''}
                </p>
                {completedSearches.map((s) => {
                  const isAttached = attachedSearchIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleSearch(s.id)}
                      className={cn(
                        'group flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                        isAttached
                          ? 'bg-accent-surface/20 border border-accent/20'
                          : 'hover:bg-surface-hover border border-transparent',
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isAttached ? (
                          <CheckCircle2 size={13} className="text-accent-text" />
                        ) : (
                          <div className="h-[13px] w-[13px] rounded-full border border-text-muted/30 group-hover:border-accent/50 transition-colors" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-xs leading-snug truncate',
                          isAttached ? 'text-text-primary font-medium' : 'text-text-secondary',
                        )}>
                          {s.query}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-text-muted/40 flex items-center gap-0.5">
                            <Clock size={7} />
                            {formatRelativeTime(s.created_at)}
                          </span>
                          {s.metrics?.topic_score != null && (
                            <span className="text-[10px] text-text-muted/40">
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

          {/* Attached count footer */}
          {attachedSearchIds.length > 0 && (
            <div className="shrink-0 border-t border-nativz-border/50 px-3 py-2">
              <p className="text-[10px] text-accent-text">
                {attachedSearchIds.length} search{attachedSearchIds.length !== 1 ? 'es' : ''} attached as context
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useRailOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'false') setOpenState(false);
    } catch { /* ignore */ }
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch { /* ignore */ }
  }, []);

  return [open, setOpen];
}
