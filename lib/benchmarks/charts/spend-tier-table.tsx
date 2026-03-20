'use client';

import { SPEND_TIER_DATA } from '../data';

function hitRateColor(pct: number): string {
  if (pct >= 8.5) return 'text-emerald-400';
  if (pct >= 7) return 'text-emerald-500/80';
  if (pct >= 5) return 'text-amber-400';
  return 'text-red-400';
}

export function SpendTierTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">Spend tier (monthly)</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Avg testing volume/week</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Avg hit rate</th>
          </tr>
        </thead>
        <tbody>
          {SPEND_TIER_DATA.map((row, i) => (
            <tr
              key={row.tier}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-primary font-medium">{row.tier}</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.avg_testing_volume_per_week}</td>
              <td className={`py-3 px-3 text-right font-semibold ${hitRateColor(row.avg_hit_rate_pct)}`}>
                {row.avg_hit_rate_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
