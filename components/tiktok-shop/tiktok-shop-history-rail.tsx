'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Loader2,
  Trash2,
  MoreHorizontal,
  ShoppingBag,
  Users,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  created_at: string;
  completed_at: string | null;
}

interface Props {
  searches: TikTokShopSearchSummary[];
  onSearchesChange: (next: TikTokShopSearchSummary[]) => void;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_LABEL: Record<TikTokShopSearchSummary['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
};

export function TikTokShopHistoryRail({ searches, onSearchesChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return searches;
    return searches.filter((s) => s.query.toLowerCase().includes(q));
  }, [filter, searches]);

  async function handleDelete(id: string): Promise<void> {
    const before = searches;
    onSearchesChange(searches.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/insights/search/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        onSearchesChange(before);
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? 'Failed to delete');
        return;
      }
      toast.success('Search deleted');
      if (pathname.endsWith(`/${id}`)) {
        router.push('/admin/competitor-tracking/tiktok-shop');
      }
    } catch {
      onSearchesChange(before);
      toast.error('Something went wrong');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-nativz-border px-3 py-3">
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Searches
        </h2>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded-md border border-nativz-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-text-muted">
            {searches.length === 0 ? 'No searches yet.' : 'No matches.'}
          </li>
        ) : (
          filtered.map((s) => {
            const active = pathname.endsWith(`/${s.id}`);
            const isRunning = s.status === 'queued' || s.status === 'running';
            const isFailed = s.status === 'failed';
            return (
              <li key={s.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Link
                      href={`/admin/competitor-tracking/tiktok-shop/${s.id}`}
                      className={cn(
                        'group flex flex-col gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        active
                          ? 'bg-accent-surface text-text-primary'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {s.query}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-text-primary"
                              aria-label="More"
                            >
                              <MoreHorizontal size={14} aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                void handleDelete(s.id);
                              }}
                              className="text-red-400"
                            >
                              <Trash2 size={13} className="mr-2" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-text-muted">
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1 text-accent-text">
                            <Loader2 size={10} className="animate-spin" aria-hidden />
                            {STATUS_LABEL[s.status]}
                          </span>
                        ) : isFailed ? (
                          <span className="text-red-400">Failed</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <ShoppingBag size={10} aria-hidden />
                              {s.products_found}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users size={10} aria-hidden />
                              {s.creators_found}
                            </span>
                          </>
                        )}
                        <span className="ml-auto">{formatRelative(s.created_at)}</span>
                      </div>
                    </Link>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => void handleDelete(s.id)}
                      className="text-red-400"
                    >
                      <Trash2 size={13} className="mr-2" aria-hidden />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
