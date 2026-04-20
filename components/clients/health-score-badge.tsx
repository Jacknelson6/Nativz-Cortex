'use client';

import { Heart, HeartHandshake, HeartPulse, HeartCrack } from 'lucide-react';

type HealthScore = 'not_good' | 'fair' | 'good' | 'great' | 'excellent';

const META: Record<
  HealthScore,
  { label: string; className: string; icon: React.ReactNode }
> = {
  not_good: {
    label: 'Not good',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: <HeartCrack size={11} />,
  },
  fair: {
    label: 'Fair',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: <HeartPulse size={11} />,
  },
  good: {
    label: 'Good',
    className: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    icon: <Heart size={11} />,
  },
  great: {
    label: 'Great',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <Heart size={11} />,
  },
  excellent: {
    label: 'Excellent',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: <HeartHandshake size={11} />,
  },
};

export function HealthScoreBadge({ score }: { score: HealthScore | null }) {
  if (!score) return null;
  const meta = META[score];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}
