'use client';

// ZNA-06: status pill rendered inside the post card overlay.
// Icon + short label + title attribute with the math.

import { ArrowUpRight, ArrowDownRight, Minus, Square, Clock } from 'lucide-react';
import type { TrajectoryStatus } from '@/lib/analytics/trajectory';

interface Props {
  status: TrajectoryStatus;
  label: string;
  r24: number | null;
}

const STYLES: Record<TrajectoryStatus, { bg: string; text: string }> = {
  still_climbing: { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  peaked: { bg: 'bg-white/10', text: 'text-white/70' },
  declining: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  dead: { bg: 'bg-zinc-500/15', text: 'text-zinc-300' },
  too_fresh: { bg: 'bg-amber-200/10', text: 'text-amber-200/80' },
};

function iconFor(status: TrajectoryStatus) {
  switch (status) {
    case 'still_climbing':
      return <ArrowUpRight size={12} strokeWidth={2.5} />;
    case 'declining':
      return <ArrowDownRight size={12} strokeWidth={2.5} />;
    case 'peaked':
      return <Minus size={12} strokeWidth={2.5} />;
    case 'dead':
      return <Square size={10} strokeWidth={2.5} />;
    case 'too_fresh':
      return <Clock size={11} strokeWidth={2.5} />;
  }
}

function buildTitle(status: TrajectoryStatus, label: string, r24: number | null): string {
  if (status === 'too_fresh') return 'Posts younger than 48h are still climbing.';
  if (r24 == null) return label;
  const r = r24.toFixed(2);
  return `${label} (${r}x last 24h vs prior 24h).`;
}

export function PostTrajectoryPill({ status, label, r24 }: Props) {
  const style = STYLES[status];
  return (
    <span
      title={buildTitle(status, label, r24)}
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-medium whitespace-nowrap ${style.bg} ${style.text}`}
    >
      {iconFor(status)}
      {label}
    </span>
  );
}
