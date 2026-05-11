// SPY-09 T18: dark full-viewport host that owns panel state. Renders
// one panel at a time with a 200ms cross-fade. Mounts the hotkey
// listener and a minimal panel counter so the rep always knows where
// they are.

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { PresentationSnapshot } from '@/lib/prospects/types';
import { PanelCover } from './present-panels/panel-cover';
import { PanelCurrentState } from './present-panels/panel-current-state';
import { PanelVsCompetitors } from './present-panels/panel-vs-competitors';
import { PanelBiggestOpportunity } from './present-panels/panel-biggest-opportunity';
import { PanelThirtyDayPlan } from './present-panels/panel-thirty-day-plan';
import { PanelNextStep } from './present-panels/panel-next-step';
import { PresentHotkeys } from './present-hotkeys';

interface Props {
  snapshot: PresentationSnapshot;
  variant: 'internal' | 'public';
  token?: string;
  exitHref?: string | null;
}

const PANEL_TITLES = [
  'Cover',
  'Current state',
  'vs Competitors',
  'Biggest opportunity',
  '30-day plan',
  'Next step',
];

function readInitialIndex(): number {
  if (typeof window === 'undefined') return 0;
  const match = window.location.hash.match(/#panel=(\d+)/);
  if (!match) return 0;
  const idx = Number(match[1]);
  if (Number.isFinite(idx) && idx >= 0 && idx < PANEL_TITLES.length) return idx;
  return 0;
}

export function PresentModeShell({ snapshot, variant, token, exitHref }: Props) {
  const [index, setIndex] = useState(0);
  const pathname = usePathname();

  // Hydrate hash → state without a server/client mismatch.
  useEffect(() => {
    setIndex(readInitialIndex());
  }, [pathname]);

  function goTo(next: number) {
    setIndex(next);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#panel=${next}`;
      window.history.replaceState(null, '', url);
    }
  }

  const panel = (() => {
    switch (index) {
      case 0:
        return <PanelCover cover={snapshot.cover} />;
      case 1:
        return <PanelCurrentState scorecard={snapshot.current_state} />;
      case 2:
        return (
          <PanelVsCompetitors
            vsCompetitors={snapshot.vs_competitors}
            brandName={snapshot.cover.brand_name}
          />
        );
      case 3:
        return <PanelBiggestOpportunity opportunity={snapshot.biggest_opportunity} />;
      case 4:
        return <PanelThirtyDayPlan plan={snapshot.thirty_day_plan} />;
      case 5:
        return <PanelNextStep contact={snapshot.contact} variant={variant} token={token} />;
      default:
        return null;
    }
  })();

  return (
    <div className="relative min-h-screen bg-zinc-950 text-white">
      <PresentHotkeys
        total={PANEL_TITLES.length}
        current={index}
        onChange={goTo}
        exitHref={exitHref ?? null}
      />
      <div
        key={index}
        className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col transition-opacity duration-200"
      >
        {panel}
      </div>

      {/* Footer rail: counter + dot nav */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 flex items-center justify-center">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-zinc-900/70 px-4 py-2 text-xs uppercase tracking-[0.25em] text-zinc-400 backdrop-blur">
          <span>
            {String(index + 1).padStart(2, '0')} / {String(PANEL_TITLES.length).padStart(2, '0')}
          </span>
          <span className="text-zinc-600">·</span>
          <span>{PANEL_TITLES[index]}</span>
          <div className="ml-3 flex items-center gap-1">
            {PANEL_TITLES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to panel ${i + 1}`}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index ? 'bg-emerald-300' : 'bg-zinc-600 hover:bg-zinc-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
