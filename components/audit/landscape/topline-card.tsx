import type { AuditScorecard, CompetitorProfile } from '@/lib/audit/types';
import { buildTopline } from '@/lib/audit/scorecard-helpers';

export function ToplineCard({
  scorecard,
  competitors,
}: {
  scorecard: AuditScorecard;
  competitors: CompetitorProfile[];
}) {
  const { headline, summary } = buildTopline(scorecard, competitors);
  return (
    <div className="rounded-xl border border-nativz-border bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-4 md:p-5">
      <h3 className="text-base md:text-lg font-semibold text-text-primary">{headline}</h3>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">{summary}</p>
    </div>
  );
}
