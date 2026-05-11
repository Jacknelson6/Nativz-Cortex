// SPY-09 T15: 3 action items rendered side-by-side at wide widths,
// stacked on mobile. Sentence case + no em dashes is enforced upstream
// in draft-30-day-plan.ts; the panel just renders what's saved.

import type { ThirtyDayPlan } from '@/lib/prospects/types';

interface Props {
  plan: ThirtyDayPlan;
}

export function PanelThirtyDayPlan({ plan }: Props) {
  return (
    <div className="flex h-full flex-col px-12 py-16">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        30-day plan
      </div>
      <h2 className="mt-3 text-[48px] font-semibold leading-tight text-white">
        Three moves that change the trajectory
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
        {plan.items.map((item, idx) => (
          <div key={item.id} className="flex flex-col">
            <div className="text-7xl font-semibold text-zinc-700">
              {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="mt-4 text-3xl font-semibold leading-snug text-white">
              {item.title}
            </div>
            <p className="mt-4 text-xl leading-relaxed text-zinc-300">
              {item.body}
            </p>
            <p className="mt-6 text-base leading-relaxed text-zinc-500">
              <span className="uppercase tracking-[0.25em]">Why</span>
              <span className="ml-3">{item.rationale}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
