'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Sparkles, Building2, Clock, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  TOPIC_SEARCH_HUB_HISTORY_LIMIT,
  type HistoryItem,
  type HistoryItemType,
} from '@/lib/research/history';

interface HistoryFeedProps {
  items: HistoryItem[];
  /** Changes only when server `historyItems` refresh (not when optimistic rows prepend). Resets "load more" state. */
  historyResetKey: string;
  serverHistoryCount: number;
  clients?: { id: string; name: string }[];
  onItemDeleted?: (id: string) => void;
  /** `sidebar`: narrow sticky panel for topic search two-column layout */
  variant?: 'default' | 'sidebar';
  /** With `variant="sidebar"`: hide title row — header lives in `TopicSearchHistoryRail` (Nerd-style). */
  embeddedInNerdRail?: boolean;
  /** When false, “Load more” requests omit idea generations (`include_ideas=false`). Default true. */
  includeIdeas?: boolean;
}

const HISTORY_TITLE_MAX = 50;
const HISTORY_SHORT_TITLE_CACHE_KEY = 'cortex_history_short_title_cache';
const LOAD_MORE_PAGE = 20;

function typeKindLabel(type: HistoryItemType): string {
  if (type === 'ideas') return 'Ideas';
  return 'Topic search';
}

const TYPE_ICON_TOOLTIP_W = 140;

function TypeIcon({ type }: { type: HistoryItemType }) {
  const label = typeKindLabel(type);
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const half = TYPE_ICON_TOOLTIP_W / 2;
    const left = Math.max(8 + half, Math.min(centerX, window.innerWidth - 8 - half));
    const gap = 6;
    let top = rect.bottom + gap;
    const estH = 28;
    if (top + estH > window.innerHeight - 8) {
      top = rect.top - gap - estH;
    }
    setPos({ left, top });
  }, []);

  return (
    <>
      <span
        className="inline-flex shrink-0 cursor-help rounded-sm p-0.5 transition-colors hover:bg-white/[0.06]"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={(e) => {
          updatePosition(e.currentTarget);
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
      >
        {type === 'ideas' ? (
          <Sparkles size={14} className="text-accent2-text shrink-0" aria-hidden />
        ) : (
          <Search size={14} className="shrink-0 text-text-muted" aria-hidden />
        )}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className="pointer-events-none fixed z-[200] w-max max-w-[200px] -translate-x-1/2 rounded-md border border-nativz-border bg-surface px-2 py-1 text-[11px] font-medium text-text-primary shadow-dropdown animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ left: pos.left, top: pos.top }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Mechanical fallback when AI is unavailable (same length cap). */
function mechanicalShortTitle(title: string, max = HISTORY_TITLE_MAX): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type ShortTitleEntry = { title: string; short: string };

function mergeHistoryRows(rows: HistoryItem[]): HistoryItem[] {
  const byId = new Map<string, HistoryItem>();
  for (const h of rows) {
    byId.set(h.id, h);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function HistoryFeed({
  items,
  historyResetKey,
  serverHistoryCount,
  onItemDeleted,
  variant = 'default',
  embeddedInNerdRail = false,
  includeIdeas = true,
}: HistoryFeedProps) {
  const sidebar = variant === 'sidebar';
  const nerdEmbed = sidebar && embeddedInNerdRail;
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [shortTitleCache, setShortTitleCache] = useState<Record<string, ShortTitleEntry>>({});
  const [shortTitleCacheReady, setShortTitleCacheReady] = useState(false);
  const [loadedMore, setLoadedMore] = useState<HistoryItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setLoadedMore([]);
    const fullFirstBatch =
      serverHistoryCount >=
      (includeIdeas ? 10 : TOPIC_SEARCH_HUB_HISTORY_LIMIT);
    setHasMore(fullFirstBatch);
  }, [historyResetKey, serverHistoryCount, includeIdeas]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_SHORT_TITLE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ShortTitleEntry>;
        if (parsed && typeof parsed === 'object') setShortTitleCache(parsed);
      }
    } catch {
      /* ignore */
    }
    setShortTitleCacheReady(true);
  }, []);

  const persistShortTitleCache = useCallback((next: Record<string, ShortTitleEntry>) => {
    try {
      sessionStorage.setItem(HISTORY_SHORT_TITLE_CACHE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const displayTitle = useCallback(
    (item: HistoryItem): string => {
      const t = item.title.trim();
      if (t.length <= HISTORY_TITLE_MAX) return t;
      const cached = shortTitleCache[item.id];
      if (cached?.title === t) return cached.short;
      return mechanicalShortTitle(t);
    },
    [shortTitleCache],
  );

  const mergedItems = useMemo(
    () => mergeHistoryRows([...items, ...loadedMore]),
    [items, loadedMore],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const merged = mergeHistoryRows([...items, ...loadedMore]);
    const oldest = merged[merged.length - 1]?.createdAt;
    if (!oldest) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(LOAD_MORE_PAGE),
        cursor: oldest,
      });
      if (!includeIdeas) params.set('include_ideas', 'false');
      const res = await fetch(`/api/research/history?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { items?: HistoryItem[] };
      const next = data.items ?? [];
      if (next.length === 0) {
        setHasMore(false);
        return;
      }
      const existing = new Set(mergeHistoryRows([...items, ...loadedMore]).map((i) => i.id));
      const toAdd = next.filter((i) => !existing.has(i.id));
      setLoadedMore((prev) => [...prev, ...toAdd]);
      if (next.length < LOAD_MORE_PAGE || toAdd.length === 0) setHasMore(false);
    } catch {
      toast.error('Could not load more history');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, includeIdeas, items, loadedMore, loadingMore]);

  async function handleDelete(e: React.MouseEvent, item: HistoryItem) {
    e.preventDefault();
    e.stopPropagation();
    setDeletingId(item.id);
    try {
      const endpoint = item.type === 'ideas'
        ? `/api/ideas/${item.id}`
        : `/api/search/${item.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete');
      }
      setHiddenIds((prev) => new Set(prev).add(item.id));
      setLoadedMore((prev) => prev.filter((h) => h.id !== item.id));
      onItemDeleted?.(item.id);
      toast.success('Removed from history');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    return mergedItems.filter((item) => {
      if (hiddenIds.has(item.id)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesClient = item.clientName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesClient) return false;
      }
      return true;
    });
  }, [mergedItems, hiddenIds, searchQuery]);

  const filteredKey = useMemo(
    () => filtered.map((i) => `${i.id}:${i.title}`).join('|'),
    [filtered],
  );

  const shortTitleCacheRef = useRef(shortTitleCache);
  shortTitleCacheRef.current = shortTitleCache;

  useEffect(() => {
    if (!shortTitleCacheReady) return;

    const need: { id: string; title: string }[] = [];
    for (const item of filtered) {
      const t = item.title.trim();
      if (t.length <= HISTORY_TITLE_MAX) continue;
      const cached = shortTitleCacheRef.current[item.id];
      if (cached?.title === t) continue;
      need.push({ id: item.id, title: item.title });
    }
    if (need.length === 0) return;

    let cancelled = false;
    const run = async () => {
      const batches: { id: string; title: string }[][] = [];
      for (let i = 0; i < need.length; i += 20) {
        batches.push(need.slice(i, i + 20));
      }
      const applyMechanical = (batch: { id: string; title: string }[]) => {
        setShortTitleCache((prev) => {
          const next = { ...prev };
          for (const row of batch) {
            next[row.id] = { title: row.title, short: mechanicalShortTitle(row.title) };
          }
          persistShortTitleCache(next);
          shortTitleCacheRef.current = next;
          return next;
        });
      };

      try {
        for (const batch of batches) {
          if (cancelled) return;
          const res = await fetch('/api/history/shorten-titles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batch }),
          });
          if (cancelled) return;
          if (!res.ok) {
            applyMechanical(batch);
            continue;
          }
          const data = (await res.json()) as { shorts?: Record<string, string> };
          const shorts = data.shorts ?? {};
          setShortTitleCache((prev) => {
            const next = { ...prev };
            for (const row of batch) {
              const raw = shorts[row.id]?.trim();
              const short =
                raw && raw.length > 0
                  ? raw.slice(0, HISTORY_TITLE_MAX)
                  : mechanicalShortTitle(row.title);
              next[row.id] = { title: row.title, short };
            }
            persistShortTitleCache(next);
            shortTitleCacheRef.current = next;
            return next;
          });
        }
      } catch {
        applyMechanical(need);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filteredKey tracks id+title; filtered is same render
  }, [filteredKey, shortTitleCacheReady, persistShortTitleCache]);

  const showLoadMore = hasMore && !searchQuery.trim();

  function renderHistoryRow(item: HistoryItem, index: number) {
    const isProcessing = item.status === 'processing' || item.status === 'pending';
    const uniqueKey = `${item.type}-${item.id}-${index}`;
    const isActive =
      pathname === item.href || (item.href.length > 1 && pathname.startsWith(`${item.href}/`));

    const rowInner = (
      <>
        <Link
          href={item.href}
          className="flex min-w-0 flex-1 flex-col gap-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <div className={cn('flex items-start', sidebar ? 'gap-2' : 'gap-3')}>
            <div className="mt-0.5 shrink-0">
              <TypeIcon type={item.type} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'break-words font-medium text-text-primary',
                  sidebar ? 'text-xs leading-snug' : 'text-sm',
                )}
              >
                {displayTitle(item)}
              </p>
              {item.clientName ? (
                <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-text-muted">
                  <Building2 size={10} className="shrink-0 text-accent-text/70" aria-hidden />
                  <span className="truncate">{item.clientName}</span>
                </p>
              ) : null}
              <div className={cn(item.clientName ? 'mt-0.5' : 'mt-1')}>
                <span className="flex items-center gap-1 text-[10px] text-text-muted sm:text-[11px]">
                  <Clock size={10} aria-hidden />
                  {formatRelativeTime(item.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </Link>
        <div className="flex shrink-0 items-start gap-1 pt-0.5 sm:gap-2">
          {isProcessing && (
            <>
              <Loader2 size={14} className="animate-spin text-text-muted" />
              <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                Processing
              </Badge>
            </>
          )}
          {item.status === 'failed' && <Badge variant="danger">Failed</Badge>}
          <button
            type="button"
            onClick={(e) => handleDelete(e, item)}
            disabled={deletingId === item.id}
            className="cursor-pointer rounded-md p-1 text-text-muted/30 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            title="Remove"
          >
            {deletingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </>
    );

    if (sidebar) {
      return (
        <div
          key={uniqueKey}
          className={cn(
            'group flex animate-stagger-in items-start justify-between gap-2 rounded-lg border px-1.5 py-2 pr-1 transition-colors',
            isActive
              ? 'border-accent/10 bg-accent-surface/20'
              : 'border-transparent hover:bg-surface-hover',
            isProcessing && 'opacity-70',
          )}
          style={{ animationDelay: `${index * 30}ms` }}
        >
          {rowInner}
        </div>
      );
    }

    return (
      <div key={uniqueKey}>
        <Card
          interactive
          className={cn(
            'group flex animate-stagger-in items-start justify-between gap-3 px-4 py-3',
            isProcessing && 'opacity-70',
          )}
          style={{ animationDelay: `${index * 30}ms` }}
        >
          {rowInner}
        </Card>
      </div>
    );
  }

  const loadMoreFooter = (
    <div
      className={cn(
        'flex justify-center',
        sidebar ? 'shrink-0 border-t border-nativz-border/50 px-1.5 py-2.5' : 'pt-2',
        !sidebar && 'mt-4',
      )}
    >
      <button
        type="button"
        onClick={() => void loadMore()}
        disabled={loadingMore}
        className="text-sm font-medium text-accent-text transition-colors hover:text-accent-hover disabled:opacity-50"
      >
        {loadingMore ? 'Loading…' : 'View more'}
      </button>
    </div>
  );

  const searchInput = (
    <div className={cn('relative w-full', !sidebar && 'sm:max-w-xs')}>
      <Search
        size={sidebar ? 14 : 13}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
          'w-full rounded-lg py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none',
          sidebar
            ? 'border border-nativz-border bg-background focus:border-accent/50 focus:ring-1 focus:ring-accent/50'
            : 'border border-white/[0.08] bg-white/[0.04] placeholder-text-muted focus:border-accent',
        )}
      />
    </div>
  );

  return (
    <div
      className={cn(
        sidebar && 'flex min-h-0 flex-col',
        sidebar && embeddedInNerdRail && 'h-full min-h-0 flex-1',
        sidebar && !embeddedInNerdRail && 'min-h-0 flex-1',
        sidebar &&
          !nerdEmbed &&
          'max-lg:rounded-2xl max-lg:border max-lg:border-nativz-border/50 max-lg:bg-surface/70 max-lg:p-4 max-lg:shadow-[var(--shadow-card)] lg:bg-transparent',
      )}
    >
      {/* Header + search */}
      {sidebar ? (
        nerdEmbed ? (
          <div className="shrink-0 border-b border-nativz-border/50 px-3 py-2">{searchInput}</div>
        ) : (
          <>
            <div className="shrink-0 border-b border-nativz-border/50 px-3 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                <Clock size={14} className="shrink-0 text-accent-text" aria-hidden />
                Recent history
              </h2>
            </div>
            <div className="shrink-0 border-b border-nativz-border/50 px-3 py-2">{searchInput}</div>
          </>
        )
      ) : (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex shrink-0 items-center gap-2 text-lg font-semibold text-text-primary">
            <Clock size={18} className="shrink-0 text-accent-text" />
            Recent history
          </h2>
          {searchInput}
        </div>
      )}

      {/* Items */}
      {filtered.length === 0 ? (
        <div
          className={cn(
            sidebar && 'flex min-h-0 flex-1 flex-col items-center justify-center',
          )}
        >
          <p className={cn('py-8 text-center text-sm text-text-muted', sidebar && 'py-12')}>
            No results yet
          </p>
        </div>
      ) : sidebar ? (
        <>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
            {filtered.map((item, index) => renderHistoryRow(item, index))}
          </div>
          {showLoadMore && filtered.length > 0 ? loadMoreFooter : null}
        </>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, index) => renderHistoryRow(item, index))}
          {showLoadMore && filtered.length > 0 ? loadMoreFooter : null}
        </div>
      )}
    </div>
  );
}
