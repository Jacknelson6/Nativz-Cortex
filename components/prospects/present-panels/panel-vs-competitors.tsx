// SPY-09 T13: prospect score vs the competitor scores from the latest
// benchmark. Big number for the prospect, smaller for each competitor.
// Renders an empty state when no benchmark has succeeded yet.

import type { PresentationVsCompetitors } from '@/lib/prospects/types';

interface Props {
  vsCompetitors: PresentationVsCompetitors | null;
  brandName: string;
}

export function PanelVsCompetitors({ vsCompetitors, brandName }: Props) {
  if (!vsCompetitors) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-12 text-center">
        <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
          vs competitors
        </div>
        <h2 className="mt-3 text-[48px] font-semibold leading-tight text-white">
          Benchmark not yet run
        </h2>
        <p className="mt-6 max-w-2xl text-2xl text-zinc-300">
          We can pull this in 60 seconds once we agree on which competitors to compare against.
        </p>
      </div>
    );
  }

  const sortedCompetitors = [...vsCompetitors.competitorScores].sort(
    (a, b) => b.score - a.score,
  );

  return (
    <div className="flex h-full flex-col px-12 py-16">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        vs competitors
      </div>
      <h2 className="mt-3 text-[48px] font-semibold leading-tight text-white">
        Where you sit against the field
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2">
        <div>
          <div className="text-xl text-zinc-400">{brandName}</div>
          <div className="mt-2 text-[120px] font-semibold leading-none text-emerald-300">
            {vsCompetitors.prospectScore}
          </div>
          <div className="mt-2 text-base text-zinc-500">out of 100</div>
        </div>
        <div className="space-y-5">
          {sortedCompetitors.map((c) => (
            <div key={c.handle} className="flex items-baseline justify-between gap-6">
              <div className="text-2xl text-white">@{c.handle}</div>
              <div className="text-5xl font-semibold text-zinc-300">{c.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
