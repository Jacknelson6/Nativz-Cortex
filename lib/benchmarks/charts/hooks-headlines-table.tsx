'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { HOOKS_DATA } from '../data';

function TrendIcon({ trend }: { trend: 'rising' | 'stable' | 'declining' }) {
  if (trend === 'rising') return <ArrowUp size={12} className="text-emerald-400" />;
  if (trend === 'declining') return <ArrowDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-text-muted" />;
}

export function HooksHeadlinesTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium w-10">#</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Hook type</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Usage %</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Avg CTR</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Hook rate</th>
            <th className="text-center py-3 px-3 text-text-muted font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {HOOKS_DATA.map((row, i) => (
            <tr
              key={row.hook_type}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-muted">{row.rank}</td>
              <td className="py-3 px-3 text-text-primary font-medium">{row.hook_type}</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.usage_pct}%</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.avg_ctr}%</td>
              <td className="py-3 px-3 text-right text-text-secondary font-semibold">{row.avg_hook_rate}%</td>
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
