'use client';

interface CompletenessBadgeProps {
  metadata: Record<string, unknown> | null;
  size?: 'sm' | 'md';
}

const SECTIONS = [
  { key: 'colors', check: (m: Record<string, unknown>) => Array.isArray(m.colors) && m.colors.length > 0 },
  { key: 'fonts', check: (m: Record<string, unknown>) => Array.isArray(m.fonts) && m.fonts.length > 0 },
  { key: 'logos', check: (m: Record<string, unknown>) => Array.isArray(m.logos) && m.logos.length > 0 },
  { key: 'tone', check: (m: Record<string, unknown>) => !!m.tone_primary },
  { key: 'pillars', check: (m: Record<string, unknown>) => Array.isArray(m.messaging_pillars) && m.messaging_pillars.length > 0 },
  { key: 'products', check: (m: Record<string, unknown>) => Array.isArray(m.products) && m.products.length > 0 },
  { key: 'audience', check: (m: Record<string, unknown>) => !!m.target_audience_summary },
  { key: 'positioning', check: (m: Record<string, unknown>) => !!m.competitive_positioning },
];

export function getCompleteness(metadata: Record<string, unknown> | null): number {
  if (!metadata) return 0;
  const filled = SECTIONS.filter((s) => s.check(metadata)).length;
  return Math.round((filled / SECTIONS.length) * 100);
}

export function CompletenessBadge({ metadata, size = 'sm' }: CompletenessBadgeProps) {
  const pct = getCompleteness(metadata);
  const color = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
  const bgColor = pct >= 80 ? 'bg-emerald-500/10' : pct >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10';

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center rounded-full ${bgColor} px-2 py-0.5 text-[10px] font-medium ${color}`}>
        {pct}%
      </span>
    );
  }

  // Circular progress for md size
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r={radius} fill="none"
          stroke={pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className={`absolute text-xs font-semibold ${color}`}>{pct}%</span>
    </div>
  );
}
