'use client';

// SPY-02 T11: small "Analyzing…" pill that polls until SPY-03 writes
// the first prospect_analyses row, then quietly removes itself. The
// detail page renders this in the Analysis tab while the background
// analysis finishes.
//
// SPY-03 hasn't shipped yet, so the polling endpoint is the existing
// GET /api/prospects/[id] — when analysis exists, SPY-03 will surface
// `analysis_state: 'ready'` (or similar). For v1 we look for any
// touchpoint with kind='state_change' AND body='Initial analysis ready'
// as the completion signal, which is what the SPY-03 PRD spec'd.

import useSWR from 'swr';
import { Loader2 } from 'lucide-react';

interface Props {
  prospectId: string;
}

interface Touchpoint {
  kind: string;
  body: string | null;
}

interface ProspectDetail {
  prospect: { id: string };
  touchpoints?: Touchpoint[];
  analysis?: unknown; // SPY-03 will populate this
}

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<ProspectDetail>;
  });

function analysisReady(data: ProspectDetail | undefined): boolean {
  if (!data) return false;
  if (data.analysis) return true;
  const tps = data.touchpoints ?? [];
  return tps.some(
    (t) => t.kind === 'state_change' && (t.body ?? '').toLowerCase().includes('analysis ready'),
  );
}

export function AnalysisPendingPill({ prospectId }: Props) {
  const { data } = useSWR<ProspectDetail>(`/api/prospects/${prospectId}`, fetcher, {
    refreshInterval: (d) => (analysisReady(d) ? 0 : 5000),
    revalidateOnFocus: false,
  });

  if (analysisReady(data)) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-text">
      <Loader2 size={10} className="animate-spin" />
      Analyzing…
    </span>
  );
}
