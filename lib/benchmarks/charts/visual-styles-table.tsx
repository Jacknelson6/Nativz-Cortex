'use client';

import { VISUAL_STYLES_DATA } from '../data';

export function VisualStylesTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">Visual format</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Winners</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Mid-range</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Hit rate</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">% creative</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">% spend</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Spend use ratio</th>
          </tr>
        </thead>
        <tbody>
          {VISUAL_STYLES_DATA.map((row, i) => (
            <tr
              key={row.style}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-primary font-medium">{row.style}</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.winners.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-text-muted">{row.mid_range.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-emerald-400 font-semibold">{row.hit_rate_pct}%</td>
              <td className="py-3 px-3 text-right text-text-muted">{row.pct_creative}%</td>
              <td className="py-3 px-3 text-right text-text-muted">{row.pct_spend}%</td>
              <td className={`py-3 px-3 text-right font-semibold ${row.spend_use_ratio >= 1.0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.spend_use_ratio}×
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
