// SPY-05 T17: head-to-head table. Server-renderable. 10 rows
// (checklist items) × N+1 cols (prospect + competitors). R/Y/G dots,
// summary band at top showing deltas counts.

import type { CompetitorScorecard } from '@/lib/prospects/types';
import type {
  ChecklistItem,
  ChecklistScore,
  ScorecardSnapshot,
} from '@/lib/prospects/checklist';

interface Props {
  prospectLabel: string;
  prospectSnapshot: ScorecardSnapshot;
  competitors: CompetitorScorecard[];
  deltas: { behind: string[]; ahead: string[]; tied: string[] };
}

const SCORE_DOT: Record<ChecklistScore, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  na: 'bg-text-muted/30',
};

const SCORE_LABEL: Record<ChecklistScore, string> = {
  green: 'Strong',
  yellow: 'Okay',
  red: 'Weak',
  na: 'N/A',
};

function dot(score: ChecklistScore | undefined) {
  const s = score ?? 'na';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${SCORE_DOT[s]}`} />
      <span className="text-xs text-text-muted">{SCORE_LABEL[s]}</span>
    </span>
  );
}

function getItem(
  snapshot: ScorecardSnapshot | null,
  id: string,
): ChecklistItem | null {
  if (!snapshot) return null;
  return snapshot.items.find((i) => i.id === id) ?? null;
}

export function HeadToHeadTable({
  prospectLabel,
  prospectSnapshot,
  competitors,
  deltas,
}: Props) {
  const successCompetitors = competitors.filter(
    (c) => c.status !== 'failed' && c.scorecard,
  );

  return (
    <div className="space-y-4">
      {/* Summary band */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-500">
          Behind on {deltas.behind.length}
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-500">
          Ahead on {deltas.ahead.length}
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-muted">
          Tied on {deltas.tied.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Checklist item</th>
              <th className="px-3 py-2 text-left font-medium">
                <span className="text-accent">{prospectLabel}</span>
              </th>
              {successCompetitors.map((c) => (
                <th key={`h-${c.platform}-${c.handle}`} className="px-3 py-2 text-left font-medium">
                  @{c.handle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prospectSnapshot.items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground">{item.title}</div>
                  <div className="text-xs text-text-muted">{item.description}</div>
                </td>
                <td className="px-3 py-2.5">
                  {dot(item.score)}
                  {item.note && (
                    <div className="mt-1 text-xs text-text-muted">{item.note}</div>
                  )}
                </td>
                {successCompetitors.map((c) => {
                  const ci = getItem(c.scorecard, item.id);
                  return (
                    <td key={`${item.id}-${c.handle}`} className="px-3 py-2.5">
                      {dot(ci?.score)}
                      {ci?.note && (
                        <div className="mt-1 text-xs text-text-muted">{ci.note}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {competitors.some((c) => c.status === 'failed') && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          Some competitors failed to grade and are hidden from the table.
        </div>
      )}
    </div>
  );
}
