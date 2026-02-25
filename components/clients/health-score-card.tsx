'use client';

import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getHealthLabel, getHealthColor, type HealthBreakdown } from '@/lib/clients/health';

interface HealthScoreCardProps {
  score: number;
  isNew?: boolean;
  breakdown: HealthBreakdown;
}

const breakdownLabels: { key: keyof HealthBreakdown; label: string; max: number }[] = [
  { key: 'shootStatus', label: 'Shoot Status', max: 50 },
  { key: 'contentActivity', label: 'Content Activity', max: 30 },
  { key: 'recency', label: 'Recency', max: 20 },
];

export function HealthScoreCard({ score, isNew, breakdown }: HealthScoreCardProps) {
  if (isNew) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-text-primary mb-4">Health score</h2>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-500/15 border border-zinc-500/30 mb-3">
            <Sparkles size={24} className="text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-400">New client</p>
          <p className="text-xs text-text-muted mt-1">Health score will appear after first activity</p>
        </div>
      </Card>
    );
  }

  const label = getHealthLabel(score, false);
  const colors = getHealthColor(label);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-4">Health score</h2>
      <div className="flex items-start gap-6">
        {/* Circular score */}
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
            <circle cx="48" cy="48" r="40" fill="none" strokeWidth="6" className="stroke-white/[0.06]" />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={colors.ring}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold tabular-nums ${colors.text}`}>{score}</span>
            <span className="text-[10px] text-text-muted">{label}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-2.5">
          {breakdownLabels.map(({ key, label: lbl, max }) => {
            const value = breakdown[key];
            const pct = (value / max) * 100;
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-text-muted">{lbl}</span>
                  <span className="text-text-secondary tabular-nums">{value}/{max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
