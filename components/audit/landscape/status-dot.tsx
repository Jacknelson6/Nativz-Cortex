import type { ScoreStatus } from '@/lib/audit/types';
import { cn } from '@/lib/utils/cn';

const COLOR: Record<ScoreStatus, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  poor: 'bg-red-500',
};

export function StatusDot({
  status,
  reason,
  size = 'md',
}: {
  status: ScoreStatus;
  reason?: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', dim, COLOR[status])}
      title={reason}
      aria-label={reason ? `${status}: ${reason}` : status}
    />
  );
}
