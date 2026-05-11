'use client';

// SPY-05 T16: polls the benchmark every 3s while running. Renders status
// pill, per-stage tick, cancel button. Calls router.refresh() once we hit
// a terminal state so the page can swap to the head-to-head table.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import type {
  ProspectBenchmarkStatus,
  ProspectCompetitorBenchmarkRow,
} from '@/lib/prospects/types';

interface Props {
  prospectId: string;
  benchmarkId: string;
  initialStatus: ProspectBenchmarkStatus;
}

const STAGES: { key: ProspectBenchmarkStatus; label: string }[] = [
  { key: 'discovering', label: 'Discovering' },
  { key: 'scraping', label: 'Scraping' },
  { key: 'grading', label: 'Grading' },
];

const TERMINAL: ProspectBenchmarkStatus[] = [
  'succeeded',
  'partial',
  'failed',
  'cancelled',
];

function rank(status: ProspectBenchmarkStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'discovering':
      return 1;
    case 'scraping':
      return 2;
    case 'grading':
      return 3;
    default:
      return 4;
  }
}

export function BenchmarkProgress({ prospectId, benchmarkId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ProspectBenchmarkStatus>(initialStatus);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (TERMINAL.includes(status)) {
      router.refresh();
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/prospects/${prospectId}/benchmark?id=${benchmarkId}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { benchmark: ProspectCompetitorBenchmarkRow | null };
        if (cancelled) return;
        if (json.benchmark) setStatus(json.benchmark.status);
      } catch {
        // swallow; next tick retries
      }
    };
    const interval = setInterval(tick, 3000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [prospectId, benchmarkId, status, router]);

  async function cancel() {
    setCancelling(true);
    try {
      await fetch(
        `/api/prospects/${prospectId}/benchmark/${benchmarkId}/cancel`,
        { method: 'POST' },
      );
      setStatus('cancelled');
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  const currentRank = rank(status);
  const isTerminal = TERMINAL.includes(status);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {!isTerminal && <Loader2 size={14} className="animate-spin text-accent" />}
          <span className="font-medium text-foreground">
            {isTerminal ? 'Benchmark complete' : 'Running benchmark…'}
          </span>
          <span className="text-xs text-text-muted">{status}</span>
        </div>
        {!isTerminal && (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-text-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={12} />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
      <ol className="flex flex-wrap gap-2">
        {STAGES.map((stage) => {
          const done = currentRank > rank(stage.key) || isTerminal;
          const active = !isTerminal && currentRank === rank(stage.key);
          return (
            <li
              key={stage.key}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                done
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                  : active
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : 'border-border bg-background text-text-muted'
              }`}
            >
              {done ? (
                <Check size={12} />
              ) : active ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <span className="inline-block h-2 w-2 rounded-full bg-text-muted/30" />
              )}
              {stage.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
