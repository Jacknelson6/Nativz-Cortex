'use client';

interface HealthBadgeProps {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function HealthBadge({ score, size = 'sm', className }: HealthBadgeProps) {
  const color =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : score >= 50
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30';

  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0 min-w-[28px]' : 'text-xs px-2 py-0.5 min-w-[32px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-semibold tabular-nums ${sizeClass} ${color} ${className || ''}`}
    >
      {score}
    </span>
  );
}
