// SPY-09 T12: 10 R/Y/G rows from the scorecard, big enough to read at
// 1080p on a Zoom share. Two-column at wide widths so all 10 fit
// without scrolling.

import type { ScorecardSnapshot } from '@/lib/prospects/checklist';

interface Props {
  scorecard: ScorecardSnapshot;
}

const DOT_BG: Record<string, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
  na: 'bg-zinc-600',
};

export function PanelCurrentState({ scorecard }: Props) {
  return (
    <div className="flex h-full flex-col px-12 py-16">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        Current state
      </div>
      <h2 className="mt-3 text-[48px] font-semibold leading-tight text-white">
        Where your channel sits today
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-5 md:grid-cols-2">
        {scorecard.items.map((item) => (
          <div key={item.id} className="flex items-start gap-4">
            <span
              className={`mt-2 inline-block h-3 w-3 shrink-0 rounded-full ${DOT_BG[item.score] ?? 'bg-zinc-600'}`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-2xl text-white">{item.title}</div>
              <div className="mt-1 text-base leading-relaxed text-zinc-400">
                {item.note}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
