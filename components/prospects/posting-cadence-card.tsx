'use client';

// SPY-03 T18: posting cadence card. Headline number + trend arrow.

import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react';
import type { PostingCadence } from '@/lib/prospects/types';

interface Props {
  cadence: PostingCadence | null;
}

const TREND_META: Record<string, { icon: typeof ArrowUp; label: string; tone: string }> = {
  climbing: { icon: ArrowUp, label: 'Climbing', tone: 'text-emerald-500' },
  flat: { icon: ArrowRight, label: 'Steady', tone: 'text-text-muted' },
  declining: { icon: ArrowDown, label: 'Declining', tone: 'text-red-500' },
  unknown: { icon: Minus, label: 'Unknown', tone: 'text-text-muted' },
};

export function PostingCadenceCard({ cadence }: Props) {
  if (!cadence) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        Cadence pending.
      </div>
    );
  }
  const meta = TREND_META[cadence.trend] ?? TREND_META.unknown;
  const Icon = meta.icon;
  const ppw = cadence.posts_per_week ?? 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Posting cadence</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-foreground">{ppw.toFixed(1)}</span>
        <span className="text-sm text-text-muted">posts/week</span>
      </div>
      <div className={`mt-2 flex items-center gap-1.5 text-xs ${meta.tone}`}>
        <Icon size={14} />
        <span>{meta.label}</span>
      </div>
      {cadence.note && <p className="mt-2 text-xs text-text-muted">{cadence.note}</p>}
    </div>
  );
}
