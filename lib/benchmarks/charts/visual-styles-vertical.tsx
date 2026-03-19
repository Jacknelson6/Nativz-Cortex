'use client';

import { useState } from 'react';
import { VISUAL_STYLES_BY_VERTICAL_DATA, VERTICALS } from '../data';
import type { Vertical } from '../data';

export function VisualStylesVertical({ activeFilter }: { activeFilter?: string | null }) {
  const [selectedVertical, setSelectedVertical] = useState<Vertical>(
    (activeFilter as Vertical) ?? VERTICALS[0]
  );

  const filteredData = VISUAL_STYLES_BY_VERTICAL_DATA.filter(
    (row) => row.vertical === selectedVertical
  );

  return (
    <div>
      {/* Vertical filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {VERTICALS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSelectedVertical(v)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedVertical === v
                ? 'bg-accent-surface text-accent-text'
                : 'bg-surface-hover text-text-muted hover:text-text-secondary'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nativz-border/50">
              <th className="text-left py-3 px-3 text-text-muted font-medium w-10">#</th>
              <th className="text-left py-3 px-3 text-text-muted font-medium">Style</th>
              <th className="text-right py-3 px-3 text-text-muted font-medium">Usage %</th>
              <th className="text-right py-3 px-3 text-text-muted font-medium">Avg ROAS</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <tr
                key={row.style}
                className={i % 2 === 0 ? 'bg-surface-hover/30' : ''}
              >
                <td className="py-3 px-3 text-text-muted">{row.rank}</td>
                <td className="py-3 px-3 text-text-primary font-medium">{row.style}</td>
                <td className="py-3 px-3 text-right text-text-secondary">{row.usage_pct}%</td>
                <td className="py-3 px-3 text-right text-text-secondary font-semibold">{row.avg_roas}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
