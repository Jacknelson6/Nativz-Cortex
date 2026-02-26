'use client';

interface AgencyBadgeProps {
  agency?: string | null;
  className?: string;
}

export function AgencyBadge({ agency, className }: AgencyBadgeProps) {
  if (!agency) {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border border-white/10 bg-white/5 text-text-muted ${className || ''}`}>
        Unassigned
      </span>
    );
  }

  const lower = agency.toLowerCase();

  if (lower.includes('anderson') || lower === 'ac') {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 ${className || ''}`}>
        AC
      </span>
    );
  }

  if (lower.includes('nativz')) {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border border-blue-500/30 bg-blue-500/15 text-blue-400 ${className || ''}`}>
        Nativz
      </span>
    );
  }

  // Fallback for unknown agencies
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border border-white/10 bg-white/5 text-text-muted ${className || ''}`}>
      {agency}
    </span>
  );
}

/**
 * Get normalized agency display name.
 */
export function getAgencyLabel(agency?: string | null): string {
  if (!agency) return 'Unassigned';
  const lower = agency.toLowerCase();
  if (lower.includes('anderson') || lower === 'ac') return 'AC';
  if (lower.includes('nativz')) return 'Nativz';
  return agency;
}
