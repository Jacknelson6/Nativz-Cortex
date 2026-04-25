'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * Loader stepper — replaces the old terminal-chrome research console with a
 * calmer treatment: a vertical step rail (one row per pipeline stage) plus a
 * single rotating live caption nested under the active step. Past steps
 * collapse to a check + muted label; the active step pulses and exposes a
 * crossfading sub-narrative that rotates every ~5s; future steps sit muted
 * with empty circles.
 *
 * Lines are intentionally broad-strokes ("scanning the open web", "drafting
 * the summary"). They communicate "work is happening on your behalf"
 * without exposing internal tool names, table names, or scoring terminology.
 */

interface Stage {
  label: string;
  target: number;
  duration: number;
}

interface LoaderStepperProps {
  stages: Stage[];
  stageIndex: number;
}

// Sub-narratives shown ~every 5s under the active step. Cycled via modulo
// so long phases (research, assemble) keep the feed alive instead of
// freezing after the array is exhausted.
const STAGE_SUBLINES: Record<string, string[]> = {
  // llm_v1 pipeline
  'Gathering live web sources for your angles': [
    'scanning the open web',
    'checking news outlets and industry blogs',
    'reading top sources',
    'pulling key passages',
    'cross-referencing niche forums',
    'sampling community threads',
    'queuing pages for closer reading',
    'tracking signal across outlets',
    'noting recurring phrases',
    'dropping low-signal pages',
    're-ranking by relevance',
    'highlighting credible voices',
    'capturing quotes that matter',
    'watching for contradictions',
    'logging source freshness',
  ],
  'Exploring each angle you set in your gameplan': [
    'thinking through each angle',
    'drawing on prior research',
    'noting key findings',
    'testing assumptions against evidence',
    'surfacing edge cases',
    'looking for under-covered takes',
    'sanity-checking the framing',
    'widening the lens a bit',
    'returning to the strongest threads',
  ],
  'Tightening sources and trimming overlap': [
    'comparing what we found',
    'trimming duplicates',
    'merging near-identical passages',
    'flagging weak citations',
    'consolidating the short list',
    'picking the cleanest source per point',
    "dropping anything we can't verify",
  ],
  'Weaving findings into themes and narrative': [
    'finding common themes',
    'drafting the summary',
    'shaping the narrative',
    'ordering points for clarity',
    'tightening the throughline',
    'swapping in stronger phrasing',
    'pressure-testing the angle',
    'checking flow between sections',
    'rereading for tone',
  ],
  'Shaping video directions from what we found': [
    'sketching video angles',
    'ranking ideas by traction',
    'writing candidate hooks',
    'shortlisting hooks worth testing',
    'pairing angles with formats',
    'matching ideas to audience mood',
    'refining the one-line pitches',
    'filing weaker ideas for later',
  ],
  'Assembling your report': [
    'putting it all together',
    'polishing the layout',
    'final formatting',
    'stacking the ideas in order',
    'pulling stat callouts forward',
    'checking headline phrasing',
    'rebalancing sections',
    'setting the cover context',
    'wiring up the appendix',
    'dry-running the hand-off copy',
    'checking spacing and rhythm',
    'spot-checking the examples',
    'trimming anything redundant',
    'fixing small wording quirks',
    'verifying hook attributions',
    'locking in the recommended angle',
    'doing a final pass on the summary',
    'cleaning up citations',
    'last look before we hand it over',
  ],
  // legacy multi-platform
  'Searching the web': [
    'scanning the open web',
    'reading top results',
    'pulling headlines worth a look',
    'skimming the first page of hits',
    'sorting by recency',
    'saving passages with signal',
  ],
  'Scanning Reddit discussions': [
    'reading top threads',
    'pulling community signals',
    'checking what people actually argue about',
    'noting repeated complaints',
    'tagging the most upvoted takes',
    'filtering out off-topic noise',
  ],
  'Fetching YouTube videos & transcripts': [
    'scanning YouTube',
    'watching key videos',
    'pulling transcripts',
    'clipping standout moments',
    'noting creator angles',
    'watching engagement spikes',
    'flagging hooks that worked',
  ],
  'Scraping TikTok & comments': [
    'checking TikTok',
    'reading top comments',
    'spotting viral formats',
    'noting sounds people reuse',
    'tagging the high-save posts',
    'watching for comment patterns',
  ],
  'Computing analytics': [
    'crunching the numbers',
    'measuring engagement',
    'normalizing across platforms',
    'computing topic lift',
    'double-checking outliers',
  ],
  'Generating video ideas with AI': [
    'drafting hooks',
    'shortlisting angles',
    'pairing angles with formats',
    'writing one-line pitches',
    'scoring ideas against the brief',
  ],
  'Building your report': [
    'assembling the report',
    'wrapping up',
    'putting sections in order',
    'lining up the stat callouts',
    'tightening the exec summary',
    'checking the layout',
    'trimming filler',
    'polishing hook phrasing',
    'setting the cover context',
    'dry-running the hand-off copy',
    'spot-checking examples',
    'last pass on citations',
    'final look before we hand it over',
  ],
};

const SUBLINE_INTERVAL_MS = 5000;

export function LoaderStepper({ stages, stageIndex }: LoaderStepperProps) {
  // Track the current subline index per active stage. Reset on stage change.
  const [sublineIdx, setSublineIdx] = useState(0);
  const lastStageRef = useRef(-1);

  // Reset subline counter when stage changes.
  useEffect(() => {
    if (stageIndex !== lastStageRef.current) {
      lastStageRef.current = stageIndex;
      setSublineIdx(0);
    }
  }, [stageIndex]);

  // Rotate sublines on a fixed cadence. Cycles via modulo so long stages
  // keep updating beyond the end of the array.
  useEffect(() => {
    const interval = setInterval(() => {
      setSublineIdx((i) => i + 1);
    }, SUBLINE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <ol className="flex flex-col gap-1">
      {stages.map((stage, i) => {
        const state: 'done' | 'active' | 'pending' =
          i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'pending';
        const subs = STAGE_SUBLINES[stage.label] ?? [];
        const subline = subs.length > 0 ? subs[sublineIdx % subs.length] : null;

        return (
          <li
            key={`${stage.label}-${i}`}
            className="flex items-start gap-3 py-1.5"
          >
            {/* Status indicator — fixed-width column so labels align */}
            <span
              aria-hidden
              className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"
            >
              {state === 'done' && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-accent-text">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
              {state === 'active' && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
              )}
              {state === 'pending' && (
                <span className="h-1.5 w-1.5 rounded-full bg-text-muted/40" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={
                  state === 'active'
                    ? 'text-base font-medium text-text-primary'
                    : state === 'done'
                      ? 'text-base text-text-secondary'
                      : 'text-base text-text-muted/70'
                }
              >
                {stage.label}
              </p>
              {state === 'active' && subline && (
                // key prop forces a remount on each subline change so the CSS
                // animate-fade-in keyframe fires — clean crossfade without a
                // stacked / dual-element trick.
                <p
                  key={`${stageIndex}-${sublineIdx}`}
                  className="mt-0.5 text-sm text-text-muted animate-fade-slide-in"
                >
                  {subline}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
