'use client';

import { AlertCircle } from 'lucide-react';
import { OverageReviewPill } from '@/components/deliverables/overage-review-pill';
import type { PeriodOverScopeClient } from '@/lib/deliverables/get-period-over-scope';

interface Props {
  periodId: string;
  rows: PeriodOverScopeClient[];
}

/**
 * Banner strip for the period detail editing tab. Lists each client that's
 * over its monthly editing capacity in the calendar month containing this
 * period, with the existing review pill linked per row. Renders nothing when
 * no clients are over scope, so the tab stays clean in the common case.
 */
export function OverScopeStrip({ periodId, rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-amber-300">
        <AlertCircle size={12} />
        Over-scope this month
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rows.map((r) => (
          <div
            key={r.clientId}
            className="inline-flex items-center gap-2 rounded-md border border-nativz-border bg-background/60 px-2 py-1 text-xs text-text-primary"
          >
            <span className="font-medium">{r.clientName}</span>
            <OverageReviewPill
              clientId={r.clientId}
              service="editing"
              periodId={periodId}
              overCount={r.overCount}
              variant="compact"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
