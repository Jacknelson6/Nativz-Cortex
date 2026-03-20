'use client';

import { HOOKS_DATA } from '../data';

export function HooksHeadlinesTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border/50">
            <th className="text-left py-3 px-3 text-text-muted font-medium">#</th>
            <th className="text-left py-3 px-3 text-text-muted font-medium">Hook / headline type</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Hit rate</th>
            <th className="text-right py-3 px-3 text-text-muted font-medium">Spend use ratio</th>
          </tr>
        </thead>
        <tbody>
          {HOOKS_DATA.map((row, i) => (
            <tr
              key={row.hook_type}
              className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
            >
              <td className="py-3 px-3 text-text-muted">{i + 1}</td>
              <td className="py-3 px-3 text-text-primary font-medium">{row.hook_type}</td>
              <td className="py-3 px-3 text-right text-emerald-400 font-semibold">{row.hit_rate_pct}%</td>
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
