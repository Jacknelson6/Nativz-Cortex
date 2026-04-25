'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Research console — a terminal-style live log shown while a topic search
 * runs. The lines are intentionally broad-strokes ("scanning the open web",
 * "checking TikTok", "drafting the summary"). They give the user a sense
 * that work is happening without exposing internal tool names, table
 * names, or proprietary scoring terminology — Jack flagged the original
 * version (e.g. "querying SearXNG · DuckDuckGo backend", "persisting to
 * topic_searches") as leaking too much. Treat this surface as a public
 * marketing register, not a developer log.
 *
 * The feed is driven off the parent's stage timeline (already computed in
 * search-processing); on each stage transition we open a new line, and an
 * 8s interval emits broad sub-narratives so long phases don't freeze the
 * console. Lines do not need to be 1:1 accurate — the goal is "we are
 * working on your behalf", not full instrumentation.
 */

interface Stage {
  label: string;
  target: number;
  duration: number;
}

interface ResearchConsoleProps {
  stages: Stage[];
  stageIndex: number;
}

interface LogLine {
  ts: number;
  /** Pre-formatted HH:MM:SS clock — computed at emit time so we don't
   *  re-`new Date()` and re-pad the string on every render of every line. */
  clock: string;
  tag: string;
  text: string;
  /** Closed-out lines render slightly dimmer; the active line gets the cursor. */
  closed?: boolean;
}

// Short ALL-CAPS action tag per stage label. Generic verbs / surfaces, no
// tool names. Falls back to the first word uppercased if a label isn't in
// the table — keeps the console alive even if the pipeline's stage labels
// drift. Tags are deliberately friendly action words (SEARCH, READ, WRITE)
// rather than internal pipeline phases (DEDUPE, SYNTH, MERGE_RETRY).
const STAGE_TAGS: Record<string, string> = {
  // llm_v1 pipeline
  'Gathering live web sources for your angles': 'SEARCH',
  'Exploring each angle you set in your gameplan': 'THINK',
  'Tightening sources and trimming overlap': 'CHECK',
  'Weaving findings into themes and narrative': 'WRITE',
  'Shaping video directions from what we found': 'IDEAS',
  'Assembling your report': 'BUILD',
  // legacy multi-platform
  'Searching the web': 'WEB',
  'Scanning Reddit discussions': 'REDDIT',
  'Fetching YouTube videos & transcripts': 'YOUTUBE',
  'Scraping TikTok & comments': 'TIKTOK',
  'Computing analytics': 'STATS',
  'Generating video ideas with AI': 'IDEAS',
  'Building your report': 'BUILD',
};

// Broad-strokes sub-narratives shown ~every 8s while a stage is active.
// These do NOT need to be 1:1 accurate to what the pipeline is actually
// doing — the goal is to communicate "work is happening on your behalf"
// without exposing internal tool names (SearXNG, DuckDuckGo, Apify, Groq),
// internal data (evidence buffer, allowlist, JSON payload), or DB table
// names (topic_searches). Mention public-facing surfaces (web, TikTok,
// Reddit, YouTube, Instagram) freely — those are user-comprehensible.
const STAGE_SUBLINES: Record<string, string[]> = {
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
    'dropping anything we can\'t verify',
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

function tagFor(label: string): string {
  if (STAGE_TAGS[label]) return STAGE_TAGS[label];
  // Fallback: first word uppercased, max 8 chars.
  const first = label.split(/\s+/)[0] ?? label;
  return first.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const SUBLINE_INTERVAL_MS = 5000;
const MAX_LINES = 40;

export function ResearchConsole({ stages, stageIndex }: ResearchConsoleProps) {
  const [lines, setLines] = useState<LogLine[]>(() => {
    const ts = Date.now();
    return [
      // Marketing-register opener — no internal pipeline identifiers leak.
      {
        ts,
        clock: formatClock(ts),
        tag: 'START',
        text: 'starting your research session',
        closed: true,
      },
    ];
  });
  const lastStageRef = useRef(-1);
  const sublinesEmittedRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // On stage change: close out the previous active line and append a new
  // "stage opening" line. Reset the subline counter so the next stage starts
  // its own narrative cycle. Trim defensively so any accidental whitespace
  // in the source string doesn't show up as misaligned text in the console.
  useEffect(() => {
    if (stageIndex < 0 || stageIndex >= stages.length) return;
    if (stageIndex === lastStageRef.current) return;
    const stage = stages[stageIndex];
    const tag = tagFor(stage.label);
    const text = stage.label.trim().toLowerCase() + '…';
    setLines((prev) => {
      const next = prev.length > 0
        ? [...prev.slice(0, -1), { ...prev[prev.length - 1], closed: true }]
        : prev;
      const ts = Date.now();
      return [...next, { ts, clock: formatClock(ts), tag, text }].slice(-MAX_LINES);
    });
    lastStageRef.current = stageIndex;
    sublinesEmittedRef.current = 0;
  }, [stageIndex, stages]);

  // Within a stage: emit broad sub-narratives on an interval so the feed
  // doesn't freeze during long phases (the merger LLM call can run 30–90s,
  // and the final report stage sits for ~2 minutes on average). Sublines
  // cycle with modulo so the feed keeps emitting updates indefinitely.
  useEffect(() => {
    const interval = setInterval(() => {
      if (stageIndex < 0 || stageIndex >= stages.length) return;
      const stage = stages[stageIndex];
      const subs = STAGE_SUBLINES[stage.label];
      if (!subs?.length) return;
      const idx = sublinesEmittedRef.current;
      const text = subs[idx % subs.length].trim();
      sublinesEmittedRef.current = idx + 1;
      const tag = tagFor(stage.label);
      setLines((prev) => {
        const closed = prev.length > 0
          ? [...prev.slice(0, -1), { ...prev[prev.length - 1], closed: true }]
          : prev;
        const ts = Date.now();
        return [...closed, { ts, clock: formatClock(ts), tag, text }].slice(-MAX_LINES);
      });
    }, SUBLINE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [stageIndex, stages]);

  // Auto-scroll to the latest line whenever the log grows.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const lastIdx = lines.length - 1;

  return (
    <div className="rounded-2xl border border-nativz-border bg-nativz-ink-2/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {/* Console chrome — three dots + breadcrumb to lean into the
          terminal/working-session register. */}
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border/70 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-text-muted/40" />
          <span className="h-2 w-2 rounded-full bg-text-muted/40" />
          <span className="h-2 w-2 rounded-full bg-text-muted/40" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70">
          cortex · pipeline · live
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-text-muted/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          running
        </span>
      </div>

      {/* Log surface — fixed-width timestamp + tag columns so message text
          starts at the same horizontal position on every line regardless
          of tag length (INIT vs SEARCH vs IDEAS). Without explicit widths
          the ALL-CAPS tag would shift the message column slightly. */}
      <div
        ref={scrollRef}
        className="max-h-[300px] min-h-[180px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]"
      >
        {lines.map((line, i) => {
          const isActive = i === lastIdx && !line.closed;
          return (
            <div
              key={`${line.ts}-${i}`}
              className={`flex items-baseline gap-3 ${line.closed ? 'opacity-60' : 'opacity-100'} animate-fade-slide-in`}
            >
              <span className="w-[64px] shrink-0 tabular-nums text-text-muted/60">
                {line.clock}
              </span>
              <span className="w-[72px] shrink-0 truncate text-accent-text">
                {line.tag}
              </span>
              <span className="min-w-0 flex-1 break-words text-text-secondary">
                {line.text}
                {isActive && (
                  <span
                    aria-hidden
                    className="ml-1 inline-block h-3 w-[6px] translate-y-[1px] bg-accent align-baseline animate-cortex-cursor"
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
