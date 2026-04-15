'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type StrategyLabStepperProps = {
  hasCompletedTopicSearch: boolean;
  hasPillars: boolean;
  brandDnaReady: boolean;
  hasCompletedIdeaGeneration: boolean;
  hasAnalysisBoards: boolean;
};

const STEPS = [
  { key: 'search', label: 'Topic searches', sub: 'Run research on themes' },
  { key: 'pillars', label: 'Content pillars & ideas', sub: 'Pillars, DNA, then batches' },
  { key: 'brand', label: 'Brand DNA', sub: 'On-brand ideation' },
  { key: 'ideas', label: 'Idea batches', sub: 'Named runs (e.g. March)' },
  { key: 'analysis', label: 'Analysis boards', sub: 'Reference video breakdown' },
] as const;

/**
 * First incomplete step in the strategy funnel (0–4).
 * Order: topic search → pillars → brand DNA → ideas → analysis (ongoing).
 */
export function getStrategyLabFocusStep(props: StrategyLabStepperProps): number {
  if (!props.hasCompletedTopicSearch) return 0;
  if (!props.hasPillars) return 1;
  if (!props.brandDnaReady) return 2;
  if (!props.hasCompletedIdeaGeneration) return 3;
  return 4;
}

export function StrategyLabStepper(props: StrategyLabStepperProps) {
  const focus = getStrategyLabFocusStep(props);

  const done = (i: number) => {
    if (i === 0) return props.hasCompletedTopicSearch;
    if (i === 1) return props.hasPillars;
    if (i === 2) return props.brandDnaReady;
    if (i === 3) return props.hasCompletedIdeaGeneration;
    return props.hasAnalysisBoards;
  };

  return (
    <div className="rounded-xl border border-nativz-border/50 bg-surface/80 px-3 py-4 sm:px-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
        Strategy workspace
      </p>
      <p className="mb-4 text-sm text-text-secondary">
        Work top to bottom: topic research, then content pillars and brand DNA, then named idea batches for
        shoots, then analysis boards for reference clips. Use the strategy assistant to talk it through with
        Cortex.
      </p>
      <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-2">
        {STEPS.map((step, i) => {
          const isDone = done(i);
          const isFocus = i === focus && !isDone;
          return (
            <li
              key={step.key}
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2.5 sm:max-w-[11.5rem]',
                isDone && 'border-emerald-500/35 bg-emerald-500/[0.06]',
                isFocus && 'border-accent/45 bg-accent/[0.08] ring-1 ring-accent/20',
                !isDone && !isFocus && 'border-nativz-border/40 bg-background/30',
              )}
            >
              <div className="flex items-center gap-2">
                {isDone ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : isFocus ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/25 text-accent-text">
                    <Circle className="h-3 w-3 fill-current" aria-hidden />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-nativz-border/60 text-[10px] font-semibold text-text-muted">
                    {i + 1}
                  </span>
                )}
                <span className="text-xs font-semibold leading-tight text-text-primary">{step.label}</span>
              </div>
              <span className="pl-8 text-xs leading-snug text-text-muted">{step.sub}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
