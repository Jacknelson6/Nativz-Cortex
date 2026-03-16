'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Building2, Clock, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { HistoryItem, HistoryItemType } from '@/lib/research/history';

interface HistoryFeedProps {
  items: HistoryItem[];
  clients?: { id: string; name: string }[];
  onViewAll?: () => void;
}

const TYPE_FILTERS: { label: string; value: HistoryItemType | null }[] = [
  { label: 'All', value: null },
  { label: 'Brand intel', value: 'brand_intel' },
  { label: 'Topic', value: 'topic' },
  { label: 'Ideas', value: 'ideas' },
];

const TYPE_BADGE_CONFIG: Record<HistoryItemType, { variant: 'purple' | 'default'; label: string }> = {
  brand_intel: { variant: 'default', label: 'Brand intel' },
  topic: { variant: 'default', label: 'Topic' },
  ideas: { variant: 'purple', label: 'Ideas' },
};

function TypeIcon({ type }: { type: HistoryItemType }) {
  if (type === 'ideas') return <Sparkles size={14} className="text-purple-400 shrink-0" />;
  if (type === 'brand_intel') return <Building2 size={14} className="text-purple-400 shrink-0" />;
  return <Search size={14} className="text-text-muted shrink-0" />;
}

export function HistoryFeed({ items, onViewAll }: HistoryFeedProps) {
  const [typeFilter, setTypeFilter] = useState<HistoryItemType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = items.filter((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = item.title.toLowerCase().includes(q);
      const matchesClient = item.clientName?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesClient) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Clock size={18} className="text-accent-text" />
          Recent history
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            View all history
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-white/[0.04] rounded-lg p-0.5 gap-0.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? 'bg-white/[0.08] text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-[180px]"
          />
        </div>
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No results yet</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, index) => {
            const badge = TYPE_BADGE_CONFIG[item.type];
            const isProcessing = item.status === 'processing' || item.status === 'pending';
            const uniqueKey = `${item.type}-${item.id}-${index}`;

            const content = (
              <Card
                interactive
                className={`flex items-center justify-between py-3 px-4 animate-stagger-in ${isProcessing ? 'opacity-70' : ''}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon type={item.type} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
                      <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                      {item.clientName && (
                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                          <Building2 size={10} />
                          {item.clientName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isProcessing && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Loader2 size={14} className="animate-spin text-text-muted" />
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">Processing</Badge>
                  </div>
                )}
                {item.status === 'failed' && <Badge variant="danger">Failed</Badge>}
              </Card>
            );

            return <Link key={uniqueKey} href={item.href}>{content}</Link>;
          })}
        </div>
      )}
    </div>
  );
}
