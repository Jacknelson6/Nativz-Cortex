'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { VISUAL_STYLES_DATA } from '../data';
import type { VisualStyleRow } from '../data';

type SortKey = 'usage_pct' | 'avg_roas';

function TrendIcon({ trend }: { trend: 'rising' | 'stable' | 'declining' }) {
  if (trend === 'rising') return <ArrowUp size={12} className="text-emerald-400" />;
  if (trend === 'declining') return <ArrowDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-text-muted" />;
}

export function VisualStylesTable() {
  const [sortKey, setSortKey] = useState<SortKey>('usage_pct');
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...VISUAL_STYLES_DATA].sort((a: VisualStyleRow, b: VisualStyleRow) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });

  const SortIndicator = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium w-10">#</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Visual style</th>
            <th
              className="text-right py-3 px-3 text-text-muted font-medium cursor-pointer select-none hover:text-text-secondary transition-colors"
              onClick={() => handleSort('usage_pct')}
            >
              <span className="inline-flex items-center gap-1">
                Usage % <SortIndicator col="usage_pct" />
              </span>
            </th>
            <th
              className="text-right py-3 px-3 text-text-muted font-medium cursor-pointer select-none hover:text-text-secondary transition-colors"
              onClick={() => handleSort('avg_roas')}
            >
              <span className="inline-flex items-center gap-1">
                Avg ROAS <SortIndicator col="avg_roas" />
              </span>
            </th>
            <th className="text-center py-3 px-3 text-text-muted font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.style}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-muted">{row.rank}</td>
              <td className="py-3 px-3 text-text-primary font-medium">{row.style}</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.usage_pct}%</td>
              <td className="py-3 px-3 text-right text-text-secondary font-semibold">{row.avg_roas}x</td>
              <td className="py-3 px-3 text-center">
                <span className="inline-flex items-center gap-1 text-xs capitalize">
                  <TrendIcon trend={row.trend} />
                  {row.trend}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
