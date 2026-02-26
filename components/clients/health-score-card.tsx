'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { getHealthLabel, getHealthColor, type HealthBreakdown } from '@/lib/clients/health';

type HealthOverride = 'poor' | 'fair' | 'good' | 'excellent' | null;

interface HealthScoreCardProps {
  score: number;
  isNew?: boolean;
  breakdown: HealthBreakdown;
  clientId?: string;
  healthOverride?: HealthOverride;
}

const OVERRIDE_OPTIONS: { value: HealthOverride; label: string; color: string }[] = [
  { value: null, label: 'Auto', color: 'text-text-muted' },
  { value: 'poor', label: 'Poor', color: 'text-red-400' },
  { value: 'fair', label: 'Fair', color: 'text-yellow-400' },
  { value: 'good', label: 'Good', color: 'text-blue-400' },
  { value: 'excellent', label: 'Excellent', color: 'text-emerald-400' },
];

const OVERRIDE_SCORE: Record<string, number> = {
  poor: 15,
  fair: 40,
  good: 65,
  excellent: 90,
};

const breakdownLabels: { key: keyof HealthBreakdown; label: string; max: number }[] = [
  { key: 'shootStatus', label: 'Shoot Status', max: 50 },
  { key: 'contentActivity', label: 'Content Activity', max: 30 },
  { key: 'recency', label: 'Recency', max: 20 },
];

export function HealthScoreCard({ score, isNew, breakdown, clientId, healthOverride }: HealthScoreCardProps) {
  const [override, setOverride] = useState<HealthOverride>(healthOverride ?? null);
  const [saving, setSaving] = useState(false);

  const displayScore = override ? OVERRIDE_SCORE[override] : score;
  const label = override
    ? (override.charAt(0).toUpperCase() + override.slice(1))
    : getHealthLabel(score, false);
  const colors = getHealthColor(
    override === 'excellent' ? 'Healthy'
    : override === 'good' ? 'Good'
    : override === 'fair' ? 'Needs Attention'
    : override === 'poor' ? 'Critical'
    : getHealthLabel(score, false)
  );

  async function handleOverrideChange(value: string) {
    const newOverride = value === '' ? null : value as HealthOverride;
    setOverride(newOverride);

    if (!clientId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ health_score_override: newOverride }),
      });
      if (!res.ok) throw new Error();
      toast.success('Health score updated');
    } catch {
      toast.error('Failed to update health score');
      setOverride(healthOverride ?? null);
    } finally {
      setSaving(false);
    }
  }

  if (isNew && !override) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Health score</h2>
          {clientId && (
            <select
              value={override ?? ''}
              onChange={(e) => handleOverrideChange(e.target.value)}
              disabled={saving}
              className="rounded-lg border border-nativz-border bg-surface-hover px-2 py-1 text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {OVERRIDE_OPTIONS.map((opt) => (
                <option key={opt.value ?? 'auto'} value={opt.value ?? ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
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

  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary">Health score</h2>
        {clientId && (
          <select
            value={override ?? ''}
            onChange={(e) => handleOverrideChange(e.target.value)}
            disabled={saving}
            className="rounded-lg border border-nativz-border bg-surface-hover px-2 py-1 text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {OVERRIDE_OPTIONS.map((opt) => (
              <option key={opt.value ?? 'auto'} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
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
            <span className={`text-2xl font-bold tabular-nums ${colors.text}`}>{displayScore}</span>
            <span className="text-[10px] text-text-muted">{label}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        {!override && (
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
        )}
        {override && (
          <div className="flex-1 flex items-center">
            <p className="text-xs text-text-muted">Manual override active. Set to &ldquo;Auto&rdquo; to use calculated score.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
