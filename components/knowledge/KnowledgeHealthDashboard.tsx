'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import type { KnowledgeEntry } from '@/lib/knowledge/types';

interface KnowledgeHealthDashboardProps {
  entries: KnowledgeEntry[];
  /** Fixed clock for “stale” comparisons (set once in parent). */
  asOf: Date;
}

const GUIDELINE_TYPES = new Set([
  'guideline',
  'brand_guideline',
  'visual_identity',
  'verbal_identity',
]);

const STALE_DAYS = 90;

export function KnowledgeHealthDashboard({ entries, asOf }: KnowledgeHealthDashboardProps) {
  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    let superseded = 0;
    let staleGuidelines = 0;
    const cutoff = asOf.getTime() - STALE_DAYS * 86400000;

    for (const e of entries) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      if (e.superseded_by) superseded++;
      if (GUIDELINE_TYPES.has(e.type) && !e.superseded_by) {
        const t = new Date(e.updated_at ?? e.created_at).getTime();
        if (t < cutoff) staleGuidelines++;
      }
    }

    const actionOpen = entries.filter((e) => e.type === 'action_item' && !e.superseded_by).length;

    return {
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      superseded,
      staleGuidelines,
      actionOpen,
      total: entries.length,
    };
  }, [entries, asOf]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm p-8">
        <BarChart3 className="size-8 opacity-40 mb-2" aria-hidden />
        <p>No entries to report on.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-nativz-border bg-surface/60 p-3">
          <div className="text-2xl font-semibold text-text-primary tabular-nums">{stats.total}</div>
          <div className="text-xs text-text-secondary">Total nodes</div>
        </div>
        <div className="rounded-lg border border-nativz-border bg-surface/60 p-3">
          <div className="text-2xl font-semibold text-text-primary tabular-nums">{stats.superseded}</div>
          <div className="text-xs text-text-secondary">Superseded</div>
        </div>
        <div className="rounded-lg border border-nativz-border bg-surface/60 p-3">
          <div className="text-2xl font-semibold text-text-primary tabular-nums">{stats.actionOpen}</div>
          <div className="text-xs text-text-secondary">Action items</div>
        </div>
        <div className="rounded-lg border border-nativz-border bg-surface/60 p-3">
          <div className="text-2xl font-semibold text-amber-400/90 tabular-nums">{stats.staleGuidelines}</div>
          <div className="text-xs text-text-secondary">Stale guidelines ({STALE_DAYS}d+)</div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">By type</p>
        <ul className="space-y-1 text-sm">
          {stats.byType.map(([type, count]) => (
            <li
              key={type}
              className="flex justify-between gap-4 rounded-md px-2 py-1 hover:bg-surface/80"
            >
              <span className="text-text-secondary capitalize">{type.replace(/_/g, ' ')}</span>
              <span className="tabular-nums text-text-primary">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
