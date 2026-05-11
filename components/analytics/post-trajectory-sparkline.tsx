'use client';

// ZNA-06: tiny 7-day sparkline rendered inside the post card overlay.
// Uses inline SVG (not Recharts) - Recharts in a w-14/h-5 box brings far
// more JS than the 12 polyline points need, and a hand-rolled path keeps
// the grid feather-light at scale.

import type { TrajectoryStatus } from '@/lib/analytics/trajectory';

interface Props {
  views: number[];
  status: TrajectoryStatus;
  className?: string;
}

const STROKE: Record<TrajectoryStatus, string> = {
  still_climbing: '#34d399',  // emerald-400
  peaked: 'rgba(255,255,255,0.45)',
  declining: '#fbbf24',       // amber-400
  dead: 'rgba(161,161,170,0.7)', // zinc-400
  too_fresh: 'transparent',
};

export function PostTrajectorySparkline({ views, status, className }: Props) {
  if (status === 'too_fresh') return null;
  const data = views.length > 0 ? views : [];
  if (data.length === 0) return null;

  const W = 56;
  const H = 20;
  const PAD = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;

  const points = data
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className ?? ''}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={STROKE[status]}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
