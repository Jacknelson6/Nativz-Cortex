'use client';

import { TOP25_COMPARISON_DATA } from '../data';

export function Top25Comparison() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">Spend tier</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">All — vol/wk</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Top 25% — vol/wk</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">All — winners/mo</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Top 25% — winners/mo</th>
          </tr>
        </thead>
        <tbody>
          {TOP25_COMPARISON_DATA.map((row, i) => {
            const volMultiple = row.all_creative_vol > 0
              ? (row.top25_creative_vol / row.all_creative_vol).toFixed(1)
              : '—';
            return (
              <tr
                key={row.tier}
                className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
              >
                <td className="py-3 px-3 text-text-primary font-medium">{row.tier}</td>
                <td className="py-3 px-3 text-right text-text-muted">{row.all_creative_vol}</td>
                <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                  {row.top25_creative_vol}
                  <span className="text-[10px] text-text-muted ml-1">({volMultiple}×)</span>
                </td>
                <td className="py-3 px-3 text-right text-text-muted">{row.all_winners_per_mo}</td>
                <td className="py-3 px-3 text-right text-emerald-400 font-semibold">{row.top25_winners_per_mo}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
