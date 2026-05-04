'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { OverageReviewPill } from '@/components/deliverables/overage-review-pill';

interface OverScopeRow {
  clientId: string;
  clientName: string;
  overCount: number;
}

interface Props {
  periodId: string;
}

/**
 * Banner strip for the period detail editing tab. Lists each client that's
 * over its monthly editing capacity in the calendar month containing this
 * period, with the existing review pill linked per row. Renders nothing when
 * no clients are over scope, so the tab stays clean in the common case.
 */
export function OverScopeStrip({ periodId }: Props) {
  const [rows, setRows] = useState<OverScopeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/accounting/periods/${periodId}/over-scope`);
        if (!res.ok) {
          if (!cancelled) setRows([]);
          return;
        }
        const json = (await res.json()) as { clients: OverScopeRow[] };
        if (!cancelled) setRows(json.clients ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [periodId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" />
        Checking over-scope clients…
      </div>
    );
  }

  if (!rows || rows.length === 0) return null;

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
