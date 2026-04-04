'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, Search, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { HistoryItem } from '@/lib/research/history';

interface PortalRecentSearchesProps {
  clientId: string;
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
    default:
      return null;
  }
}

function portalHref(item: HistoryItem): string {
  return item.href.replace(/^\/admin\//, '/portal/');
}

export function PortalRecentSearches({ clientId }: PortalRecentSearchesProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      limit: '5',
      client_id: clientId,
      type: 'topic',
    });

    fetch(`/api/research/history?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-muted">Recent searches</h3>
        <Link
          href="/portal/search/history"
          className="text-xs text-accent-text hover:text-accent-hover flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <Link key={item.id} href={portalHref(item)}>
            <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-3 py-2.5 hover:bg-surface-hover transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <Search size={14} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">{item.title}</p>
                  <span className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              </div>
              {statusBadge(item.status)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
