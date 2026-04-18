'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Search as SearchIcon,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

export interface TikTokShopSearchSummary {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  products_found: number;
  creators_found: number;
  client_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Props {
  searches: TikTokShopSearchSummary[];
  onSearchesChange: (next: TikTokShopSearchSummary[]) => void;
}

const menuItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer outline-none transition-colors';
const menuSurfaceClass =
  'min-w-[180px] rounded-xl border border-nativz-border bg-surface p-1 shadow-xl';

/**
 * Left-rail history for TikTok Shop searches — mirrors the Organic Social
 * (audit) rail: "History" header with bulk-delete affordance, search input,
 * poll-until-settled for in-flight rows, shift-click multi-select, context
 * menu + dropdown per row. Differences from the audit rail:
 *
 *   - Row icon is a consistent ShoppingBag (TikTok Shop searches are
 *     category-based, not website-based, so favicons don't apply).
 *   - No "copy public share link" — TikTok Shop searches don't have
 *     share tokens today. If that ships later, add a menu item here.
 */
export function TikTokShopHistoryRail({ searches, onSearchesChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const searchesRef = useRef(searches);
  searchesRef.current = searches;
  const onChangeRef = useRef(onSearchesChange);
  onChangeRef.current = onSearchesChange;

  // Poll in-flight searches (queued / running) so status icons update
  // without a page refresh. Same pattern as AuditHistoryRail: interval
  // only runs while there's something to watch.
  const hasInFlight = useMemo(
    () => searches.some((s) => s.status === 'queued' || s.status === 'running'),
    [searches],
  );
  useEffect(() => {
    if (!hasInFlight) return;
    let cancelled = false;

    const tick = async () => {
      const inFlight = searchesRef.current.filter(
        (s) => s.status === 'queued' || s.status === 'running',
      );
      if (inFlight.length === 0) return;
      const updates = new Map<string, TikTokShopSearchSummary>();
      await Promise.all(
        inFlight.map(async (s) => {
          try {
            const res = await fetch(`/api/insights/search/${s.id}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = (await res.json()) as { search?: Partial<TikTokShopSearchSummary> };
            if (!data.search) return;
            updates.set(s.id, {
              ...s,
              status: (data.search.status as TikTokShopSearchSummary['status']) ?? s.status,
              products_found: data.search.products_found ?? s.products_found,
              creators_found: data.search.creators_found ?? s.creators_found,
              completed_at: data.search.completed_at ?? s.completed_at,
            });
          } catch {
            /* ignore transient errors */
          }
        }),
      );
      if (cancelled || updates.size === 0) return;
      const next = searchesRef.current.map((s) => updates.get(s.id) ?? s);
      const changed = next.some((n, i) => n !== searchesRef.current[i]);
      if (changed) onChangeRef.current(next);
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasInFlight]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return searches;
    const q = searchQuery.toLowerCase();
    return searches.filter((s) => s.query.toLowerCase().includes(q));
  }, [searches, searchQuery]);

  function toggleSelect(id: string, e?: React.MouseEvent) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && prev.size > 0) {
        const ids = filtered.map((s) => s.id);
        const lastSelected = [...prev].pop()!;
        const startIdx = ids.indexOf(lastSelected);
        const endIdx = ids.indexOf(id);
        if (startIdx >= 0 && endIdx >= 0) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string): Promise<void> {
    const prevSearches = searches;
    const prevSelected = new Set(selectedIds);
    onSearchesChange(searches.filter((s) => s.id !== id));
    if (selectedIds.has(id)) {
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
    }
    try {
      const res = await fetch(`/api/insights/search/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Search deleted');
      if (pathname.endsWith(`/${id}`)) {
        router.push('/admin/competitor-tracking/tiktok-shop');
      }
    } catch {
      onSearchesChange(prevSearches);
      setSelectedIds(prevSelected);
      toast.error('Failed to delete');
    }
  }

  async function handleDeleteSelected(): Promise<void> {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const prevSearches = searches;
    onSearchesChange(searches.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
    const failures: string[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/insights/search/${id}`, { method: 'DELETE' });
          if (!res.ok) failures.push(id);
        } catch {
          failures.push(id);
        }
      }),
    );
    if (failures.length > 0) {
      onSearchesChange(prevSearches.filter((s) => !ids.includes(s.id) || failures.includes(s.id)));
      toast.error(`${failures.length} search${failures.length === 1 ? '' : 'es'} failed to delete`);
    } else {
      toast.success(`${ids.length} search${ids.length === 1 ? '' : 'es'} deleted`);
    }
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-nativz-border/50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">History</span>
          {hasSelection && (
            <button
              onClick={() => void handleDeleteSelected()}
              className="flex cursor-pointer items-center gap-1 text-xs text-red-400 transition-colors hover:text-red-300"
            >
              <Trash2 size={12} aria-hidden /> Delete {selectedIds.size}
            </button>
          )}
        </div>
        <div className="relative w-full">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-nativz-border bg-background py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-text-muted">
            {searches.length === 0 ? 'No searches yet' : 'No results'}
          </div>
        )}
        {filtered.map((s, index) => {
          const href = `/admin/competitor-tracking/tiktok-shop/${s.id}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const isSelected = selectedIds.has(s.id);
          const isProcessing = s.status === 'queued' || s.status === 'running';

          const menuItems = (
            <>
              <DropdownMenuItem className={menuItemClass} onSelect={() => router.push(href)}>
                <ExternalLink size={14} aria-hidden /> Open
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleDelete(s.id);
                }}
              >
                <Trash2 size={14} aria-hidden /> Delete
              </DropdownMenuItem>
            </>
          );

          return (
            <ContextMenu key={s.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'group flex w-full min-w-0 animate-stagger-in cursor-default items-center gap-1 rounded-lg border px-1.5 py-1 pr-1 transition-colors',
                    isActive
                      ? 'border-accent/10 bg-accent-surface/20'
                      : isSelected
                      ? 'border-accent/20 bg-accent-surface/10'
                      : 'border-transparent hover:bg-surface-hover',
                    isProcessing && 'opacity-70',
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={(e) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      toggleSelect(s.id, e);
                    }
                  }}
                >
                  <Link
                    href={href}
                    className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-hover/60">
                      <ShoppingBag size={10} className="text-text-muted/70" aria-hidden />
                    </div>
                    <span
                      className={cn(
                        'truncate text-sm leading-snug transition-colors',
                        isActive
                          ? 'text-text-primary'
                          : 'text-text-secondary group-hover:text-text-primary',
                      )}
                      title={s.query}
                    >
                      {s.query}
                    </span>
                  </Link>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {isProcessing && <Loader2 size={13} className="animate-spin text-text-muted" aria-hidden />}
                    {s.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="More actions"
                          title="More actions"
                          className="shrink-0 rounded-md p-1 text-text-muted opacity-100 transition-[opacity,background-color,color] duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4} className={menuSurfaceClass}>
                        {menuItems}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className={menuSurfaceClass}>
                <ContextMenuItem className={menuItemClass} onSelect={() => router.push(href)}>
                  <ExternalLink size={14} aria-hidden /> Open
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleDelete(s.id);
                  }}
                >
                  <Trash2 size={14} aria-hidden /> Delete
                </ContextMenuItem>
                {hasSelection && selectedIds.size > 1 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleDeleteSelected();
                      }}
                    >
                      <Trash2 size={14} aria-hidden /> Delete {selectedIds.size} selected
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
