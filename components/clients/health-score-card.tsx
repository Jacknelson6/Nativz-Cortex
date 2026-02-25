'use client';

import { Card } from '@/components/ui/card';
import type { HealthBreakdown } from '@/lib/clients/health';

interface HealthScoreCardProps {
  score: number;
  breakdown: HealthBreakdown;
}

const breakdownLabels: { key: keyof HealthBreakdown; label: string; max: number }[] = [
  { key: 'searchFrequency', label: 'Search frequency', max: 25 },
  { key: 'recency', label: 'Recency', max: 25 },
  { key: 'shootActivity', label: 'Shoots', max: 20 },
  { key: 'moodboardActivity', label: 'Moodboards', max: 15 },
  { key: 'contentOutput', label: 'Content output', max: 15 },
];

function getScoreColor(score: number) {
  if (score >= 80) return { ring: 'stroke-emerald-400', text: 'text-emerald-400', label: 'Healthy' };
  if (score >= 50) return { ring: 'stroke-amber-400', text: 'text-amber-400', label: 'Needs attention' };
  return { ring: 'stroke-red-400', text: 'text-red-400', label: 'At risk' };
}

export function HealthScoreCard({ score, breakdown }: HealthScoreCardProps) {
  const { ring, text, label } = getScoreColor(score);
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
              className={ring}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold tabular-nums ${text}`}>{score}</span>
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
                    style={{ width: `${pct}%` }}
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
