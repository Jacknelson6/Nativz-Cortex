'use client';

// SPY-03 T16: caption-pattern card. Two number stats with bars + voice note.

import type { CaptionPattern } from '@/lib/prospects/types';

interface Props {
  pattern: CaptionPattern | null;
}

export function CaptionPatternCard({ pattern }: Props) {
  if (!pattern) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        Caption analysis pending.
      </div>
    );
  }
  const hookPct = Math.round((pattern.hook_quality_avg ?? 0) * 100);
  const ctaPct = Math.round((pattern.cta_rate ?? 0) * 100);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Caption pattern</h3>
      <div className="space-y-3">
        <Stat label="Hook quality" value={hookPct} suffix="/100" />
        <Stat label="CTA rate" value={ctaPct} suffix="%" />
      </div>
      <p className="mt-3 text-xs text-text-muted">{pattern.voice_note}</p>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
