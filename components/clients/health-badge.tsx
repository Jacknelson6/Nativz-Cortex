'use client';

type HealthScore = 'not_good' | 'fair' | 'good' | 'great' | 'excellent';

const HEALTH_CONFIG: Record<HealthScore, { label: string; bg: string; text: string; border: string }> = {
  not_good:  { label: 'Not good',  bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30' },
  fair:      { label: 'Fair',      bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  good:      { label: 'Good',      bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  great:     { label: 'Great',     bg: 'bg-teal-500/15',    text: 'text-teal-400',    border: 'border-teal-500/30' },
  excellent: { label: 'Excellent', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

interface HealthBadgeProps {
  healthScore?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function HealthBadge({ healthScore, size = 'sm', className }: HealthBadgeProps) {
  if (!healthScore || !(healthScore in HEALTH_CONFIG)) return null;

  const config = HEALTH_CONFIG[healthScore as HealthScore];
  const sizeClass = size === 'sm'
    ? 'text-[10px] px-1.5 py-0'
    : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-semibold ${sizeClass} ${config.bg} ${config.text} ${config.border} ${className || ''}`}
    >
      {config.label}
    </span>
  );
}

export { HEALTH_CONFIG };
export type { HealthScore };
