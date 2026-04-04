'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  Clock,
  Loader2,
  FileText,
  AlertCircle,
  Timer,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { HistoryItem, HistoryItemType } from '@/lib/research/history';

interface PortalSearchHistoryFeedProps {
  clientId: string;
}

const PAGE_SIZE = 20;

/** Remap /admin/ URLs to /portal/ for portal users. */
function portalHref(item: HistoryItem): string {
  return item.href.replace(/^\/admin\//, '/portal/');
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
    case 'done':
      return <Badge variant="success">Ready</Badge>;
    case 'processing':
    case 'pending':
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          Processing
        </Badge>
      );
    case 'pending_subtopics':
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <Timer size={10} />
          Pending
        </Badge>
      );
    case 'failed':
    case 'error':
      return <Badge variant="danger">Failed</Badge>;
    default:
      return null;
  }
}

function typeIcon(type: HistoryItemType) {
  if (type === 'ideas') return <Sparkles size={16} className="text-amber-400 shrink-0" />;
  return <Search size={16} className="text-accent-text shrink-0" />;
}

export function PortalSearchHistoryFeed({ clientId }: PortalSearchHistoryFeedProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'topic' | 'ideas'>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        client_id: clientId,
      });
      if (filter !== 'all') params.set('type', filter);
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/research/history?${params}`);
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      return data.items as HistoryItem[];
    },
    [clientId, filter],
  );

  // Initial load + refetch on filter change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchItems()
      .then((newItems) => {
        if (cancelled) return;
        setItems(newItems);
        setHasMore(newItems.length >= PAGE_SIZE);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchItems]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && items.length > 0) {
          setLoadingMore(true);
          const lastItem = items[items.length - 1];
          fetchItems(lastItem.createdAt)
            .then((more) => {
              setItems((prev) => [...prev, ...more]);
              setHasMore(more.length >= PAGE_SIZE);
              setLoadingMore(false);
            })
            .catch(() => setLoadingMore(false));
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, items, fetchItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm text-text-muted">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchItems()
              .then((newItems) => {
                setItems(newItems);
                setHasMore(newItems.length >= PAGE_SIZE);
                setLoading(false);
              })
              .catch((err) => {
                setError(err.message);
                setLoading(false);
              });
          }}
          className="text-sm text-accent-text hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-surface p-1 w-fit">
        {([['all', 'All'], ['topic', 'Searches'], ['ideas', 'Ideas']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-background text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="No searches yet"
          description={
            filter === 'all'
              ? 'Topic research and ideas for your account will appear here.'
              : filter === 'topic'
                ? 'No topic searches found.'
                : 'No idea generations found.'
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <Link key={item.id} href={portalHref(item)}>
              <Card
                interactive
                className="animate-stagger-in flex items-center justify-between"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {typeIcon(item.type)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.title}
                    </p>
                    <span className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                </div>
                {statusBadge(item.status)}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p className="text-center text-xs text-text-muted py-2">No more items</p>
      )}
    </div>
  );
}
