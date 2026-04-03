'use client';

import { HEATMAP_DATA, VERTICALS, SPEND_TIERS } from '../data';
import type { SpendTier, Vertical } from '../data';

function heatColor(value: number): string {
  if (value <= 3) return 'bg-accent/10';
  if (value <= 5) return 'bg-accent/20';
  if (value <= 10) return 'bg-accent/30';
  if (value <= 18) return 'bg-accent/40';
  if (value <= 30) return 'bg-accent/55';
  return 'bg-accent/70';
}

function textColor(value: number): string {
  if (value <= 10) return 'text-text-secondary';
  return 'text-foreground font-bold';
}

function getCell(vertical: Vertical, tier: SpendTier): number {
  const cell = HEATMAP_DATA.find((c) => c.vertical === vertical && c.tier === tier);
  return cell?.weekly_creatives ?? 0;
}

export function TestingHeatmap() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header row */}
        <div className="grid gap-1" style={{ gridTemplateColumns: '180px repeat(5, 1fr)' }}>
          <div className="py-2 px-2" />
          {SPEND_TIERS.map((tier) => (
            <div key={tier} className="py-2 px-1 text-center text-xs text-text-muted font-medium leading-tight">
              {tier}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {VERTICALS.map((vertical) => (
          <div
            key={vertical}
            className="grid gap-1"
            style={{ gridTemplateColumns: '180px repeat(5, 1fr)' }}
          >
            <div className="py-2 px-2 text-xs text-text-secondary font-medium flex items-center">
              {vertical}
            </div>
            {SPEND_TIERS.map((tier) => {
              const value = getCell(vertical, tier);
              return (
                <div
                  key={tier}
                  className={`rounded-md py-3 px-2 text-center text-sm font-semibold ${heatColor(value)} ${textColor(value)}`}
                >
                  {value}
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-end gap-3 mt-4 text-[10px] text-text-muted">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-6 h-3 rounded-sm bg-blue-950/60" />
            <div className="w-6 h-3 rounded-sm bg-blue-900/70" />
            <div className="w-6 h-3 rounded-sm bg-blue-700/60" />
            <div className="w-6 h-3 rounded-sm bg-blue-600/60" />
            <div className="w-6 h-3 rounded-sm bg-blue-500/60" />
            <div className="w-6 h-3 rounded-sm bg-blue-400/60" />
          </div>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
