'use client';

import { getHealthLabel, getHealthColor, type HealthLabel } from '@/lib/clients/health';

interface HealthBadgeProps {
  score: number;
  isNew?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function HealthBadge({ score, isNew, size = 'sm', className }: HealthBadgeProps) {
  const label: HealthLabel = isNew ? 'New' : getHealthLabel(score, false);
  const colors = getHealthColor(label);

  const sizeClass = size === 'sm'
    ? 'text-[10px] px-1.5 py-0'
    : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-full border font-semibold ${sizeClass} ${colors.bg} ${colors.text} ${colors.border} ${className || ''}`}
    >
      <span className="tabular-nums">{isNew ? '—' : score}</span>
      {size === 'md' && <span>{label}</span>}
    </span>
  );
}
