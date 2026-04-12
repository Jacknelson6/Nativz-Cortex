'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Sparkles,
  Building2,
  Clock,
  Loader2,
  Trash2,
  Check,
  Compass,
  Link2,
  ExternalLink,
  MoreHorizontal,
  Copy,
  FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { mergeTopicSearchSelectionIntoLocalStorage } from '@/lib/strategy-lab/topic-search-selection-storage';
import {
  TOPIC_SEARCH_HUB_HISTORY_LIMIT,
  type HistoryItem,
  type HistoryItemType,
} from '@/lib/research/history';
import { useTopicSearchFolders } from '@/lib/hooks/use-topic-search-folders';
import { TopicSearchHistoryFolders } from '@/components/research/topic-search-history-folders';
import { researchHistorySidebarSectionTitleClass } from '@/components/research/research-history-sidebar-section-title';
import { DraggableSearchRow, DragOverlayCard } from '@/components/research/history-dnd';

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
  /** Sidebar: checkboxes to pin topic searches for Strategy lab (client-linked rows only). */
  enableStrategyLabBulkSelect?: boolean;
  onStrategyLabSelectionChange?: (payload: { ids: string[]; clientId: string | null }) => void;
  /** Research hub rail: hide client line in rows; show client in ⋯ menu instead. */
  hideClientInSidebar?: boolean;
  /** Filter history to only show items for this client. When set, load-more also filters server-side. */
  filterClientId?: string | null;
  /** Research hub rail: folders + infinite scroll styling. */
  enableFolders?: boolean;
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
            className="pointer-events-none fixed z-[200] w-max max-w-[200px] -translate-x-1/2 rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs font-medium text-text-primary shadow-dropdown animate-in fade-in-0 zoom-in-95 duration-150"
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

/** Topic / brand intel searches can be bulk-selected for Strategy lab (including unbranded). */
function canSelectForStrategyLab(item: HistoryItem): boolean {
  return item.type === 'topic' || item.type === 'brand_intel';
}

type RowMenuPrimitives = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
};

const CONTEXT_MENU_PRIMITIVES: RowMenuPrimitives = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

const DROPDOWN_MENU_PRIMITIVES: RowMenuPrimitives = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

function HistoryRowMenuBody({
  M,
  isTopicLike,
  showStrategyLabToggleItem,
  strategyLabToggleDisabled,
  showBulkSelectionSubmenu,
  checked,
  bulkCount,
  menuItemClass,
  menuSurfaceClass,
  onOpen,
  onCopyLink,
  onOpenStrategyLab,
  onToggleStrategyLab,
  onDelete,
  onDeleteAllSelected,
  onCopyAllSelectedLinks,
  folderContext,
}: {
  M: RowMenuPrimitives;
  isTopicLike: boolean;
  showStrategyLabToggleItem: boolean;
  strategyLabToggleDisabled: boolean;
  showBulkSelectionSubmenu: boolean;
  checked: boolean;
  bulkCount: number;
  menuItemClass: string;
  menuSurfaceClass: string;
  onOpen: () => void;
  onCopyLink: () => void;
  onOpenStrategyLab: () => void;
  onToggleStrategyLab: () => void;
  onDelete: () => void;
  onDeleteAllSelected: () => void;
  onCopyAllSelectedLinks: () => void;
  folderContext?: { onRemoveFromFolder: () => void };
}) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = M;
  return (
    <>
      <Item className={menuItemClass} onSelect={onOpen}>
        <ExternalLink size={14} aria-hidden />
        Open
      </Item>
      <Item
        className={menuItemClass}
        onSelect={() => {
          void onCopyLink();
        }}
      >
        <Link2 size={14} aria-hidden />
        Copy link to search
      </Item>
      {isTopicLike ? (
        <Item className={menuItemClass} onSelect={onOpenStrategyLab}>
          <Compass size={14} aria-hidden />
          Open in Strategy lab
        </Item>
      ) : null}
      {showStrategyLabToggleItem && isTopicLike ? (
        <Item
          className={menuItemClass}
          disabled={strategyLabToggleDisabled}
          onSelect={onToggleStrategyLab}
        >
          <Check size={14} aria-hidden />
          {checked ? 'Deselect' : 'Select'}
        </Item>
      ) : null}
      {/* "Add to folder" submenu was gated behind `{false && ...}` — dead code
          removed (folder drag-and-drop is the only supported add path now). */}
      {folderContext ? (
        <>
          <Separator className="bg-nativz-border" />
          <Item className={menuItemClass} onSelect={folderContext.onRemoveFromFolder}>
            Remove from folder
          </Item>
        </>
      ) : null}
      <Separator className="bg-nativz-border" />
      <Item variant="destructive" className={menuItemClass} onSelect={(e) => { e.preventDefault(); onDelete(); }}>
        <Trash2 size={14} aria-hidden />
        Delete
      </Item>
      {showBulkSelectionSubmenu ? (
        <>
          <Separator className="bg-nativz-border" />
          <Sub>
            <SubTrigger className={cn(menuItemClass, 'data-[state=open]:bg-surface-hover')}>
              Selected searches
            </SubTrigger>
            <SubContent className={cn(menuSurfaceClass, 'min-w-[11rem]')}>
              <Item
                className={menuItemClass}
                disabled={bulkCount === 0}
                onSelect={() => {
                  void onDeleteAllSelected();
                }}
              >
                Delete all selected
                {bulkCount > 0 ? (
                  <span className="ml-auto text-[10px] text-text-muted">({bulkCount})</span>
                ) : null}
              </Item>
              <Item
                className={menuItemClass}
                disabled={bulkCount === 0}
                onSelect={() => {
                  void onCopyAllSelectedLinks();
                }}
              >
                <Copy size={14} aria-hidden />
                Copy link to all
              </Item>
            </SubContent>
          </Sub>
        </>
      ) : null}
    </>
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
  enableStrategyLabBulkSelect = false,
  onStrategyLabSelectionChange,
  hideClientInSidebar = false,
  filterClientId = null,
  enableFolders = false,
}: HistoryFeedProps) {
  const sidebar = variant === 'sidebar';
  const nerdEmbed = sidebar && embeddedInNerdRail;
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [shortTitleCache, setShortTitleCache] = useState<Record<string, ShortTitleEntry>>({});
  const [shortTitleCacheReady, setShortTitleCacheReady] = useState(false);
  const [loadedMore, setLoadedMore] = useState<HistoryItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedTopicSearchIds, setSelectedTopicSearchIds] = useState<Set<string>>(new Set());
  /** Checkboxes and bulk actions only after user chooses “Select” from the row menu. */
  const [selectionModeActive, setSelectionModeActive] = useState(false);

  const {
    folders: topicSearchFolders,
    createFolder: createTopicFolder,
    addTopicToFolder,
    removeTopicFromFolder,
  } = useTopicSearchFolders(Boolean(enableFolders && sidebar));

  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setLoadedMore([]);
    const fullFirstBatch =
      serverHistoryCount >=
      (includeIdeas ? 10 : TOPIC_SEARCH_HUB_HISTORY_LIMIT);
    setHasMore(fullFirstBatch);
  }, [historyResetKey, serverHistoryCount, includeIdeas, filterClientId]);

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

  useEffect(() => {
    if (!enableStrategyLabBulkSelect) return;
    setSelectedTopicSearchIds((prev) => {
      const valid = new Set(
        mergedItems.filter((i) => !hiddenIds.has(i.id)).map((i) => i.id),
      );
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [mergedItems, hiddenIds, enableStrategyLabBulkSelect]);

  useEffect(() => {
    if (!enableStrategyLabBulkSelect) {
      setSelectionModeActive(false);
    }
  }, [enableStrategyLabBulkSelect]);

  /** Stable list order for Strategy lab payload (same order as history list, newest first). */
  const orderedSelectedIds = useMemo(() => {
    if (selectedTopicSearchIds.size === 0) return [];
    const out: string[] = [];
    for (const it of mergedItems) {
      if (selectedTopicSearchIds.has(it.id)) out.push(it.id);
    }
    return out;
  }, [mergedItems, selectedTopicSearchIds]);

  const firstSelectedInOrder = useMemo(() => {
    if (selectedTopicSearchIds.size === 0) return null;
    for (const it of mergedItems) {
      if (hiddenIds.has(it.id)) continue;
      if (selectedTopicSearchIds.has(it.id)) return it;
    }
    return null;
  }, [mergedItems, selectedTopicSearchIds, hiddenIds]);

  const strategyLabPayload = useMemo(() => {
    if (!enableStrategyLabBulkSelect) {
      return { ids: [] as string[], clientId: null as string | null };
    }
    if (orderedSelectedIds.length === 0) return { ids: [], clientId: null };
    const first = mergedItems.find((i) => i.id === orderedSelectedIds[0]);
    return { ids: orderedSelectedIds, clientId: first?.clientId ?? null };
  }, [enableStrategyLabBulkSelect, orderedSelectedIds, mergedItems]);

  const strategyLabNotifyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enableStrategyLabBulkSelect) {
      strategyLabNotifyKeyRef.current = null;
      return;
    }
    if (!onStrategyLabSelectionChange) return;
    const { ids, clientId } = strategyLabPayload;
    const key = `${clientId ?? 'null'}|${[...ids].sort().join(',')}`;
    if (strategyLabNotifyKeyRef.current === key) return;
    strategyLabNotifyKeyRef.current = key;
    onStrategyLabSelectionChange({ ids: [...ids], clientId });
  }, [strategyLabPayload, enableStrategyLabBulkSelect, onStrategyLabSelectionChange]);

  const handleStrategyLabToggle = useCallback(
    (item: HistoryItem) => {
      if (!canSelectForStrategyLab(item)) return;
      setSelectedTopicSearchIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
          return next;
        }
        const firstInOrder = mergedItems.find((i) => prev.has(i.id));
        if (firstInOrder && item.clientId !== firstInOrder.clientId) {
          return prev;
        }
        next.add(item.id);
        return next;
      });
    },
    [mergedItems],
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
      if (filterClientId) params.set('client_id', filterClientId);
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
  }, [hasMore, includeIdeas, items, loadedMore, loadingMore, filterClientId]);

  loadMoreRef.current = loadMore;

  async function deleteHistoryItem(item: HistoryItem): Promise<boolean> {
    // Optimistic: hide the row immediately, then rollback if the API rejects.
    setHiddenIds((prev) => new Set(prev).add(item.id));
    setLoadedMore((prev) => prev.filter((h) => h.id !== item.id));
    onItemDeleted?.(item.id);

    try {
      const endpoint = item.type === 'ideas'
        ? `/api/ideas/${item.id}`
        : `/api/search/${item.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete');
      }
      toast.success('Removed from history');
      return true;
    } catch (err) {
      // Rollback — unhide the row so the user can retry
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
      return false;
    }
  }

  /**
   * Copy a public, shareable URL for a topic search — one that works for
   * anyone, no Cortex login required. For topic/brand_intel rows we mint a
   * share token via /api/search/:id/share and use the `/shared/search/:token`
   * public route. For other row types (e.g. ideas generations) we fall back
   * to the internal cortex URL because no public share endpoint exists yet.
   */
  const copyLinkToSearch = useCallback(async (item: HistoryItem) => {
    const isShareable =
      (item.type === 'topic' || item.type === 'brand_intel') && item.status === 'completed';
    try {
      if (isShareable) {
        const res = await fetch(`/api/search/${item.id}/share`, { method: 'POST' });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error || 'Failed to create share link');
        }
        await navigator.clipboard.writeText(data.url);
        toast.success('Public share link copied');
        return;
      }
      // Can't mint a share token for pending/processing rows — fall back to
      // the internal cortex URL so the user at least gets SOMETHING copied.
      const url = `${window.location.origin}${item.href}`;
      await navigator.clipboard.writeText(url);
      if (item.status !== 'completed') {
        toast.message('Search still running — copied internal link. Public share available once complete.');
      } else {
        toast.success('Link copied');
      }
    } catch (err) {
      console.warn('[history-feed] copy share link failed:', err);
      toast.error('Could not copy link');
    }
  }, []);

  const openInStrategyLab = useCallback(
    (item: HistoryItem) => {
      if (item.type === 'ideas') return;
      if (item.clientId) {
        mergeTopicSearchSelectionIntoLocalStorage(item.clientId, [item.id]);
        router.push(`/admin/strategy-lab/${item.clientId}`);
      } else {
        toast.message('Pick a client in Strategy lab, then pin topic searches from your history.');
        router.push('/admin/strategy-lab');
      }
    },
    [router],
  );

  /** Bulk open in Strategy Lab — merges all selected search IDs into localStorage. */
  const openAllSelectedInStrategyLab = useCallback(() => {
    const ids = orderedSelectedIds;
    if (ids.length === 0) return;
    // Resolve client from selection — all must share the same client
    const rows = ids
      .map((id) => mergedItems.find((i) => i.id === id))
      .filter((r): r is HistoryItem => Boolean(r));
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))];
    if (clientIds.length === 0) {
      toast.message('Pick a client in Strategy Lab, then pin topic searches from your history.');
      router.push('/admin/strategy-lab');
      return;
    }
    if (clientIds.length > 1) {
      toast.error('Selected searches belong to different clients. Select searches from one client at a time.');
      return;
    }
    const clientId = clientIds[0]!;
    mergeTopicSearchSelectionIntoLocalStorage(clientId, ids);
    setSelectionModeActive(false);
    setSelectedTopicSearchIds(new Set());
    router.push(`/admin/strategy-lab/${clientId}`);
  }, [orderedSelectedIds, mergedItems, router]);

  /**
   * Bulk copy — same public share link behaviour as the single-row copy:
   * topic-like rows get public share URLs, everything else falls back to the
   * internal cortex URL. Done serially so we don't hammer the share endpoint.
   */
  const copyAllSelectedLinks = useCallback(async () => {
    const ids = orderedSelectedIds;
    if (ids.length === 0) return;
    const rows = ids
      .map((id) => mergedItems.find((i) => i.id === id))
      .filter((r): r is HistoryItem => Boolean(r));
    if (rows.length === 0) return;

    const lines: string[] = [];
    let publicCount = 0;
    for (const row of rows) {
      const isShareable =
        (row.type === 'topic' || row.type === 'brand_intel') && row.status === 'completed';
      if (isShareable) {
        try {
          const res = await fetch(`/api/search/${row.id}/share`, { method: 'POST' });
          const data = (await res.json().catch(() => ({}))) as { url?: string };
          if (res.ok && data.url) {
            lines.push(data.url);
            publicCount += 1;
            continue;
          }
        } catch (err) {
          console.warn('[history-feed] bulk share link failed for', row.id, err);
        }
      }
      lines.push(`${window.location.origin}${row.href}`);
    }
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      if (publicCount === lines.length) {
        toast.success(
          lines.length === 1 ? 'Public share link copied' : `${lines.length} public links copied`,
        );
      } else {
        toast.success(lines.length === 1 ? 'Link copied' : 'Links copied');
      }
    } catch {
      toast.error('Could not copy links');
    }
  }, [mergedItems, orderedSelectedIds]);

  const deleteAllSelected = useCallback(async () => {
    const ids = [...selectedTopicSearchIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} items from history?`)) return;

    // Optimistic: hide all rows immediately and clear selection. Run deletes
    // in parallel; rollback any that fail.
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setLoadedMore((prev) => prev.filter((h) => !ids.includes(h.id)));
    setSelectedTopicSearchIds(new Set());
    for (const id of ids) onItemDeleted?.(id);

    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const item = mergedItems.find((i) => i.id === id);
        if (!item) throw new Error('missing');
        const endpoint = item.type === 'ideas' ? `/api/ideas/${id}` : `/api/search/${id}`;
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok) throw new Error('failed');
        return id;
      }),
    );
    const failedIds = ids.filter((_, i) => results[i].status === 'rejected');

    if (failedIds.length > 0) {
      // Restore failed rows so user can retry
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of failedIds) next.delete(id);
        return next;
      });
      if (failedIds.length === ids.length) {
        toast.error('Could not delete selected items');
      } else {
        toast.success(`Removed ${ids.length - failedIds.length} of ${ids.length}`);
      }
    } else {
      toast.success('Removed from history');
    }
  }, [mergedItems, onItemDeleted, selectedTopicSearchIds]);

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

  const showLoadMore = hasMore && !searchQuery.trim();

  useEffect(() => {
    if (!showLoadMore) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const root = sidebar ? listScrollRef.current : null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreRef.current();
      },
      { root, rootMargin: '120px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [showLoadMore, sidebar, filteredKey, historyResetKey]);

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

  const ctxMenuSurface =
    'z-[200] min-w-[12rem] overflow-hidden rounded-lg border border-nativz-border bg-surface p-1 text-text-primary shadow-dropdown';
  const ctxMenuItem =
    'cursor-pointer rounded-md px-2 py-1.5 text-sm text-text-primary focus:bg-surface-hover focus:text-text-primary [&_svg]:text-text-muted';

  function renderHistoryRow(item: HistoryItem, index: number) {
    const isProcessing = item.status === 'processing' || item.status === 'pending';
    const uniqueKey = `${item.type}-${item.id}-${index}`;
    const isActive =
      pathname === item.href || (item.href.length > 1 && pathname.startsWith(`${item.href}/`));

    const showCheckboxColumn = enableStrategyLabBulkSelect && selectionModeActive;
    const isTopicLike = item.type === 'topic' || item.type === 'brand_intel';
    const bulkCount = selectedTopicSearchIds.size;

    const anchorCompatible =
      canSelectForStrategyLab(item) &&
      (selectedTopicSearchIds.size === 0 ||
        (firstSelectedInOrder !== null && item.clientId === firstSelectedInOrder.clientId));

    const selectable = showCheckboxColumn && anchorCompatible;
    const showIncompatibleRow =
      showCheckboxColumn &&
      canSelectForStrategyLab(item) &&
      !anchorCompatible &&
      selectedTopicSearchIds.size > 0;

    const checked = selectedTopicSearchIds.has(item.id);
    const strategyLabToggleDisabled =
      enableStrategyLabBulkSelect && isTopicLike && canSelectForStrategyLab(item) && !anchorCompatible;

    const selectionCell = showCheckboxColumn ? (
      <div
        className={cn(
          'flex shrink-0 items-start justify-center',
          sidebar ? 'w-5 pt-0.5' : 'w-6 pt-1',
        )}
      >
        {selectable ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleStrategyLabToggle(item);
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              checked
                ? 'border-accent bg-accent/15 text-accent-text'
                : 'border-nativz-border bg-background hover:border-accent/40',
            )}
            aria-label={
              checked
                ? `Deselect for Strategy lab: ${displayTitle(item)}`
                : `Select: ${displayTitle(item)}`
            }
            aria-pressed={checked}
          >
            {checked ? <Check size={10} strokeWidth={3} className="text-accent-text" aria-hidden /> : null}
          </button>
        ) : showIncompatibleRow ? (
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-dashed border-nativz-border/40 bg-background/30 opacity-40"
            title="Different client — only searches for the same brand can be selected together"
            aria-hidden
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>
    ) : null;

    const rowActionMenuProps = {
      isTopicLike,
      showStrategyLabToggleItem: Boolean(enableStrategyLabBulkSelect),
      strategyLabToggleDisabled,
      showBulkSelectionSubmenu: Boolean(enableStrategyLabBulkSelect && selectionModeActive),
      checked,
      bulkCount,
      menuItemClass: ctxMenuItem,
      menuSurfaceClass: ctxMenuSurface,
      onOpen: () => {
        router.push(item.href);
      },
      onCopyLink: () => {
        void copyLinkToSearch(item);
      },
      onOpenStrategyLab: () => {
        openInStrategyLab(item);
      },
      onToggleStrategyLab: () => {
        if (!selectionModeActive) {
          setSelectionModeActive(true);
          return;
        }
        handleStrategyLabToggle(item);
      },
      onDelete: () => {
        void deleteHistoryItem(item);
      },
      onDeleteAllSelected: () => {
        void deleteAllSelected();
      },
      onCopyAllSelectedLinks: () => {
        void copyAllSelectedLinks();
      },
      folderContext: undefined,
    };

    // In selection mode with bulk-select enabled, the whole row should toggle
    // selection on click instead of navigating. That's what "click a row to
    // select" behaves like — no more hunting for a tiny checkbox column.
    const bodyIsSelectable = showCheckboxColumn && anchorCompatible;
    const bodyClassName =
      'flex min-w-0 flex-1 overflow-hidden flex-col gap-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
    const bodyContents = (
      <div className={cn('flex min-w-0 flex-1 items-start', sidebar ? 'gap-0' : 'gap-3')}>
        {!sidebar ? (
          <div className="mt-0.5 shrink-0">
            <TypeIcon type={item.type} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm leading-snug',
              sidebar
                ? 'truncate font-normal text-text-secondary transition-colors group-hover:text-text-primary'
                : 'break-words font-medium leading-normal text-text-primary',
              sidebar && isActive && 'text-text-primary',
            )}
            title={item.title}
          >
            {displayTitle(item)}
          </p>
          {item.clientName && !(hideClientInSidebar && sidebar) ? (
            <p
              className={cn(
                'mt-1 flex min-w-0 items-center gap-1 text-text-secondary/90',
                sidebar ? 'text-sm' : 'text-[10px]',
              )}
            >
              <Building2
                size={sidebar ? 12 : 10}
                className="shrink-0 text-accent-text/70"
                aria-hidden
              />
              <span className="truncate" title={item.clientName}>{item.clientName}</span>
            </p>
          ) : null}
          {!(hideClientInSidebar && sidebar) ? (
            <div
              className={cn(
                item.clientName && !(hideClientInSidebar && sidebar) ? 'mt-0.5' : 'mt-1',
              )}
            >
              <span
                className={cn(
                  'flex items-center gap-1 text-text-secondary/75',
                  sidebar ? 'text-xs' : 'text-[10px] sm:text-xs',
                )}
              >
                <Clock size={sidebar ? 11 : 10} aria-hidden />
                {formatRelativeTime(item.createdAt)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );

    const rowInner = (
      <>
        {selectionCell}
        {bodyIsSelectable ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleStrategyLabToggle(item);
            }}
            className={cn(bodyClassName, 'cursor-pointer text-left')}
            aria-pressed={checked}
            aria-label={
              checked
                ? `Deselect ${displayTitle(item)}`
                : `Select ${displayTitle(item)}`
            }
          >
            {bodyContents}
          </button>
        ) : (
          <Link href={item.href} className={bodyClassName}>
            {bodyContents}
          </Link>
        )}
        <div
          className={cn(
            'flex shrink-0 items-start',
            sidebar ? 'gap-0.5 pt-0' : 'gap-1 pt-0.5 sm:gap-2',
          )}
        >
          {isProcessing && (
            <Loader2 size={14} className="animate-spin text-text-muted self-center" />
          )}
          {item.status === 'failed' && <Badge variant="danger">Failed</Badge>}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  'shrink-0 rounded-md p-1 text-text-muted transition-[opacity,background-color,color] duration-150 hover:bg-surface-hover hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:opacity-100',
                  // Sidebar: hide ⋯ until row hover (mobile: always visible for touch)
                  sidebar &&
                    'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100',
                )}
                aria-label="More actions"
                title="More actions"
              >
                <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className={ctxMenuSurface}>
              <HistoryRowMenuBody M={DROPDOWN_MENU_PRIMITIVES} {...rowActionMenuProps} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </>
    );

    const contextMenu = (
      <ContextMenuContent className={ctxMenuSurface}>
        <HistoryRowMenuBody M={CONTEXT_MENU_PRIMITIVES} {...rowActionMenuProps} />
      </ContextMenuContent>
    );

    if (sidebar) {
      const isDraggable = enableFolders && isTopicLike;
      const sidebarRow = (
        <ContextMenu key={uniqueKey}>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'group flex w-full min-w-0 animate-stagger-in cursor-default items-center gap-1 rounded-lg border px-1.5 py-1 pr-1 transition-colors',
                isActive
                  ? 'border-accent/10 bg-accent-surface/20'
                  : 'border-transparent hover:bg-surface-hover',
                isProcessing && 'opacity-70',
                showIncompatibleRow && 'opacity-45',
              )}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {rowInner}
            </div>
          </ContextMenuTrigger>
          {contextMenu}
        </ContextMenu>
      );

      if (isDraggable) {
        return (
          <DraggableSearchRow
            key={uniqueKey}
            searchId={item.id}
            searchTitle={item.title}
            disabled={false}
          >
            {sidebarRow}
          </DraggableSearchRow>
        );
      }

      return sidebarRow;
    }

    return (
      <ContextMenu key={uniqueKey}>
        <ContextMenuTrigger asChild>
          <div>
            <Card
              interactive
              className={cn(
                'flex animate-stagger-in cursor-default items-start justify-between gap-3 px-4 py-3',
                isProcessing && 'opacity-70',
                showIncompatibleRow && 'opacity-45',
              )}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {rowInner}
            </Card>
          </div>
        </ContextMenuTrigger>
        {contextMenu}
      </ContextMenu>
    );
  }

  const searchInput = (
    <div className={cn('relative w-full', !sidebar && 'sm:max-w-xs')}>
      <Search
        size={sidebar ? 15 : 13}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
          'w-full rounded-lg py-1.5 pl-8 pr-3 text-text-primary placeholder:text-text-muted/60 focus:outline-none',
          sidebar ? 'text-sm' : 'text-xs',
          sidebar
            ? 'border border-nativz-border bg-background focus:border-accent/50 focus:ring-1 focus:ring-accent/50'
            : 'border border-white/[0.08] bg-white/[0.04] placeholder-text-muted focus:border-accent',
        )}
      />
    </div>
  );

  /**
   * Selection-mode panel: a minimal bulk action bar at the top of the history
   * list. User triggers selection mode via a row's "Select" menu item; from
   * there every row becomes click-to-toggle, and the panel exposes the two
   * bulk actions the user actually wants — copy all share links, delete all.
   *
   * The old panel had an instructional paragraph, a "Bring to Strategy Lab"
   * primary CTA, and an "Open all in lab" button — all removed per the latest
   * product direction.
   */
  const strategyLabSelectionPanel =
    enableStrategyLabBulkSelect && selectionModeActive ? (
      <div
        className={cn(
          'shrink-0 space-y-3 border-b border-nativz-border/50 bg-surface/55',
          sidebar ? 'px-3 py-3' : 'mb-4 rounded-xl border border-nativz-border/60 bg-surface-hover/30 p-4',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn('font-semibold text-text-primary', sidebar ? 'text-sm' : 'text-xs')}>
              {selectedTopicSearchIds.size > 0
                ? `${selectedTopicSearchIds.size} selected`
                : 'Select rows'}
            </p>
            {firstSelectedInOrder?.clientName ? (
              <p
                className={cn(
                  'mt-0.5 truncate leading-snug text-text-muted',
                  sidebar ? 'text-xs' : 'text-[10px]',
                )}
                title={firstSelectedInOrder.clientName}
              >
                {firstSelectedInOrder.clientName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              'shrink-0 rounded-md px-2 py-1 font-medium text-text-muted transition hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
              sidebar ? 'text-xs' : 'text-[10px]',
            )}
            onClick={() => {
              setSelectionModeActive(false);
              setSelectedTopicSearchIds(new Set());
            }}
          >
            Done
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={selectedTopicSearchIds.size === 0}
            onClick={openAllSelectedInStrategyLab}
            className={cn(
              'inline-flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-medium text-accent-text transition hover:border-accent/50 hover:bg-accent/20 disabled:pointer-events-none disabled:opacity-40',
              sidebar ? 'text-xs' : 'text-xs',
            )}
          >
            <FlaskConical size={13} className="shrink-0" aria-hidden />
            Open in Strategy Lab
          </button>
          <button
            type="button"
            disabled={selectedTopicSearchIds.size === 0}
            onClick={() => {
              void copyAllSelectedLinks();
            }}
            className={cn(
              'inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/80 px-2.5 py-1.5 font-medium text-text-secondary transition hover:border-accent/35 hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40',
              sidebar ? 'text-xs' : 'text-xs',
            )}
          >
            <Copy size={13} className="shrink-0 text-text-muted" aria-hidden />
            Copy link to all
          </button>
          <button
            type="button"
            disabled={selectedTopicSearchIds.size === 0}
            onClick={() => {
              void deleteAllSelected();
            }}
            className={cn(
              'inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/80 px-2.5 py-1.5 font-medium text-text-secondary transition hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40',
              sidebar ? 'text-xs' : 'text-xs',
            )}
          >
            <Trash2 size={13} className="shrink-0" aria-hidden />
            Delete all
          </button>
        </div>

        {selectedTopicSearchIds.size > 0 ? (
          <button
            type="button"
            className={cn(
              'w-full text-center font-medium text-accent-text transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
              sidebar ? 'text-xs' : 'text-[10px]',
            )}
            onClick={() => setSelectedTopicSearchIds(new Set())}
          >
            Clear selection
          </button>
        ) : null}
      </div>
    ) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
  );

  const [activeDragTitle, setActiveDragTitle] = useState<string | null>(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const [lastDropFolderId, setLastDropFolderId] = useState<string | null>(null);

  const handleFolderDragStart = useCallback((event: DragStartEvent) => {
    const title = (event.active.data.current as { title?: string })?.title;
    setActiveDragTitle(title ?? 'Search');
  }, []);

  const handleFolderDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragTitle(null);
      const { active, over } = event;
      if (!over) return;
      const aid = String(active.id);
      const oid = String(over.id);
      if (aid.startsWith('search-') && oid.startsWith('folder-')) {
        const searchId = aid.slice('search-'.length);
        const folderId = oid.slice('folder-'.length);
        void (async () => {
          try {
            await addTopicToFolder(folderId, searchId);
            toast.success('Added to folder');
            setLastDropFolderId(folderId);
            setFolderRefreshKey((k) => k + 1);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not add to folder');
          }
        })();
      }
    },
    [addTopicToFolder],
  );

  /** Folders + drag-drop whenever sidebar shows folders (desktop rail and mobile). */
  const useFolderDnd = Boolean(sidebar && enableFolders);
  const dndId = useId();

  const content = (
    <>
      {/* Header + search */}
      {sidebar ? (
        nerdEmbed || enableFolders ? (
          <>
            <div className="shrink-0 border-b border-nativz-border/50 px-3 py-2">{searchInput}</div>
            {enableFolders ? (
              <TopicSearchHistoryFolders
                folders={topicSearchFolders}
                onCreateFolder={createTopicFolder}
                onRemoveFromFolder={removeTopicFromFolder}
                menuSurfaceClass={ctxMenuSurface}
                menuItemClass={ctxMenuItem}
                droppableFolders={useFolderDnd}
                refreshKey={folderRefreshKey}
                autoExpandFolderId={lastDropFolderId}
              />
            ) : null}
            {strategyLabSelectionPanel}
            {enableFolders ? (
              <div className="shrink-0 border-t border-nativz-border/30 px-3 pb-0.5 pt-2">
                <p className={researchHistorySidebarSectionTitleClass}>Your searches</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="shrink-0 border-b border-nativz-border/50 px-3 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Clock size={15} className="shrink-0 text-accent-text" aria-hidden />
                Recent history
              </h2>
            </div>
            <div className="shrink-0 border-b border-nativz-border/50 px-3 py-2">{searchInput}</div>
            {strategyLabSelectionPanel}
          </>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex shrink-0 items-center gap-2 text-lg font-semibold text-text-primary">
              <Clock size={18} className="shrink-0 text-accent-text" />
              Recent history
            </h2>
            {searchInput}
          </div>
          {strategyLabSelectionPanel}
        </>
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
          <div
            ref={listScrollRef}
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2 scrollbar-thin"
          >
            {filtered.map((item, index) => renderHistoryRow(item, index))}
            {showLoadMore && filtered.length > 0 ? (
              <>
                <div ref={loadMoreSentinelRef} className="h-2 w-full shrink-0" aria-hidden />
                {loadingMore ? (
                  <p className="py-2 text-center text-xs text-text-muted">Loading…</p>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, index) => renderHistoryRow(item, index))}
          {showLoadMore && filtered.length > 0 ? (
            <>
              <div ref={loadMoreSentinelRef} className="h-2 w-full shrink-0" aria-hidden />
              {loadingMore ? (
                <p className="py-2 text-center text-sm text-text-muted">Loading…</p>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </>
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
      {useFolderDnd ? (
        <DndContext id={dndId} sensors={sensors} onDragStart={handleFolderDragStart} onDragEnd={handleFolderDragEnd}>
          {content}
          {activeDragTitle ? <DragOverlayCard title={activeDragTitle} /> : null}
        </DndContext>
      ) : (
        content
      )}
    </div>
  );
}
