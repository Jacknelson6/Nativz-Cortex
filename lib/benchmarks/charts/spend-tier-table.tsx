'use client';

import { SPEND_TIER_DATA } from '../data';

function hitRateColor(pct: number): string {
  if (pct >= 14) return 'text-emerald-400';
  if (pct >= 10) return 'text-emerald-500/80';
  if (pct >= 7) return 'text-amber-400';
  if (pct >= 5) return 'text-amber-500/80';
  return 'text-red-400';
}

export function SpendTierTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">Spend tier</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Advertisers</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Avg creatives tested/mo</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Hit rate</th>
          </tr>
        </thead>
        <tbody>
          {SPEND_TIER_DATA.map((row, i) => (
            <tr
              key={row.tier}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-primary font-medium">{row.tier}</td>
              <td className="py-3 px-3 text-right text-text-secondary">
                {typeof row.advertisers === 'number' ? row.advertisers.toLocaleString() : row.advertisers}
              </td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.avg_creatives_tested}</td>
              <td className={`py-3 px-3 text-right font-semibold ${hitRateColor(row.hit_rate_pct)}`}>
                {row.hit_rate_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
