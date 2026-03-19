'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';
import { TOP25_COMPARISON_DATA } from '../data';

export function Top25Comparison() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">Metric</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">All advertisers</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Top 25%</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {TOP25_COMPARISON_DATA.map((row, i) => {
            const isPositiveDelta = row.delta.startsWith('+');
            const colorClass = row.positive_is_good ? 'text-emerald-400' : 'text-red-400';

            return (
              <tr
                key={row.metric}
                className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
              >
                <td className="py-3 px-3 text-text-primary font-medium">{row.metric}</td>
                <td className="py-3 px-3 text-right text-text-muted">{row.all_advertisers}</td>
                <td className="py-3 px-3 text-right text-text-secondary font-semibold">{row.top_25_pct}</td>
                <td className={`py-3 px-3 text-right font-semibold ${colorClass}`}>
                  <span className="inline-flex items-center gap-1">
                    {isPositiveDelta ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {row.delta}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
