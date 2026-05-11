'use client';

// SPY-05 T18: wrapper switching on latestBenchmark.status.
//   - no benchmark / cancelled-only → CTA + wizard
//   - running (pending/discovering/scraping/grading) → progress component
//   - succeeded/partial → head-to-head table + "Run again" button
//   - failed → error banner + retry CTA
//
// Marked 'use client' because it owns the wizard open state. The actual
// head-to-head table renders fine on the server, but composing the buttons
// alongside it is easier as one client tree.

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type {
  ProspectCompetitorBenchmarkRow,
  ProspectPlatform,
} from '@/lib/prospects/types';
import type { ScorecardSnapshot } from '@/lib/prospects/checklist';
import { BenchmarkProgress } from './benchmark-progress';
import { HeadToHeadTable } from './head-to-head-table';
import { RunBenchmarkWizard } from './run-benchmark-wizard';

interface Props {
  prospectId: string;
  prospectLabel: string;
  prospectHandle: string | null;
  defaultPlatform: ProspectPlatform;
  prospectSnapshot: ScorecardSnapshot | null;
  latestBenchmark: ProspectCompetitorBenchmarkRow | null;
  canRun: boolean;
}

const TERMINAL = new Set(['succeeded', 'partial', 'failed', 'cancelled']);

export function CompetitorBenchmarkSection({
  prospectId,
  prospectLabel,
  prospectHandle,
  defaultPlatform,
  prospectSnapshot,
  latestBenchmark,
  canRun,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  const isRunning =
    latestBenchmark && !TERMINAL.has(latestBenchmark.status);
  const hasTable =
    latestBenchmark &&
    (latestBenchmark.status === 'succeeded' ||
      latestBenchmark.status === 'partial');

  return (
    <section className="space-y-4 rounded-lg border border-border bg-background p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Competitor benchmark
          </h2>
          <p className="text-xs text-text-muted">
            Same 10-item checklist, applied to up to 3 competitors.
          </p>
        </div>
        {!isRunning && canRun && (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Sparkles size={14} />
            {hasTable ? 'Run again' : 'Run benchmark'}
          </button>
        )}
      </header>

      {!canRun && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          Run a prospect analysis first — the benchmark grades against the same checklist.
        </div>
      )}

      {isRunning && latestBenchmark && (
        <BenchmarkProgress
          prospectId={prospectId}
          benchmarkId={latestBenchmark.id}
          initialStatus={latestBenchmark.status}
        />
      )}

      {hasTable && latestBenchmark && prospectSnapshot && (
        <HeadToHeadTable
          prospectLabel={prospectLabel}
          prospectSnapshot={prospectSnapshot}
          competitors={latestBenchmark.competitors}
          deltas={latestBenchmark.deltas}
        />
      )}

      {latestBenchmark?.status === 'failed' && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          Benchmark failed: {latestBenchmark.error_message ?? 'Unknown error.'}
        </div>
      )}

      {latestBenchmark?.status === 'cancelled' && !isRunning && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
          Last benchmark was cancelled.
        </div>
      )}

      {!latestBenchmark && canRun && (
        <div className="rounded-md border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-text-muted">
          No benchmark yet. Pick up to 3 competitors and we'll grade them against the same checklist.
        </div>
      )}

      <RunBenchmarkWizard
        prospectId={prospectId}
        prospectHandle={prospectHandle}
        defaultPlatform={defaultPlatform}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </section>
  );
}
