'use client';

import { ASSET_TYPES_DATA } from '../data';

function cpaColor(index: number): string {
  if (index < 1.0) return 'text-emerald-400';
  if (index === 1.0) return 'text-text-muted';
  return 'text-red-400';
}

export function AssetTypesTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium w-10">#</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Asset type</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Usage %</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Avg ROAS</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">CPA index</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Best vertical</th>
          </tr>
        </thead>
        <tbody>
          {ASSET_TYPES_DATA.map((row, i) => (
            <tr
              key={row.asset_type}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-muted">{row.rank}</td>
              <td className="py-3 px-3 text-text-primary font-medium">{row.asset_type}</td>
              <td className="py-3 px-3 text-right text-text-secondary">{row.usage_pct}%</td>
              <td className="py-3 px-3 text-right text-text-secondary font-semibold">{row.avg_roas}x</td>
              <td className={`py-3 px-3 text-right font-semibold ${cpaColor(row.avg_cpa_index)}`}>
                {row.avg_cpa_index.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-text-muted text-xs">{row.best_vertical}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
