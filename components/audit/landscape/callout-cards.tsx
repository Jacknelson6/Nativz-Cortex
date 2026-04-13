import type { AuditScorecard } from '@/lib/audit/types';
import { rankCompetitorGaps } from '@/lib/audit/scorecard-helpers';
import { cn } from '@/lib/utils/cn';

export function CalloutCards({ scorecard }: { scorecard: AuditScorecard }) {
  const gaps = rankCompetitorGaps(scorecard);
  if (gaps.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
      {gaps.map((g) => (
        <div
          key={g.category}
          className={cn(
            'rounded-md border border-nativz-border bg-surface/50 px-3 py-2',
            g.prospectStatus === 'poor' && 'border-l-2 border-l-red-500',
            g.prospectStatus === 'warning' && 'border-l-2 border-l-amber-500',
          )}
        >
          <p className="text-xs font-medium text-text-primary">{g.label}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">{g.status_reason ?? g.description}</p>
        </div>
      ))}
    </div>
  );
}
