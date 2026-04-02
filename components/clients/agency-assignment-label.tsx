'use client';

import { cn } from '@/lib/utils';

export type AgencyAssignmentLabelProps = {
  agency?: string | null;
  className?: string;
  /**
   * Topic search hides the line when no agency. Clients grid shows muted "Unassigned"
   * so assignments are always visible.
   */
  showWhenUnassigned?: boolean;
};

/**
 * Agency line styling from the research / topic search client picker (uppercase tracking,
 * blue Nativz / emerald Anderson / muted unknown). Not the pill `AgencyBadge`.
 */
export function AgencyAssignmentLabel({
  agency,
  className,
  showWhenUnassigned = false,
}: AgencyAssignmentLabelProps) {
  const raw = agency?.trim();
  if (!raw) {
    if (!showWhenUnassigned) return null;
    return (
      <p className={cn('text-[9px] font-bold uppercase tracking-wider text-text-muted', className)}>
        Unassigned
      </p>
    );
  }

  const lower = raw.toLowerCase();

  if (lower.includes('anderson') || lower === 'ac') {
    return (
      <p className={cn('text-[9px] font-bold uppercase tracking-wider text-emerald-400', className)}>
        Anderson Collaborative
      </p>
    );
  }

  if (lower.includes('nativz')) {
    return (
      <p className={cn('text-[9px] font-bold uppercase tracking-wider text-blue-400', className)}>
        Nativz
      </p>
    );
  }

  if (lower === 'internal') {
    return (
      <p className={cn('text-[9px] font-bold uppercase tracking-wider text-accent2-text', className)}>
        Internal
      </p>
    );
  }

  return (
    <p className={cn('text-[9px] font-bold uppercase tracking-wider text-text-muted', className)}>
      {raw}
    </p>
  );
}
