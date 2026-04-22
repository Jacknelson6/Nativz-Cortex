'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Research console — a terminal-style live log of what the topic-search
 * pipeline is doing. Replaces the generic spinner + progress-bar treatment
 * with a "we did the reading" surface that exposes the machinery instead of
 * hiding it. Drives off the parent's `stages` + `stageIndex` (already
 * computed in search-processing); within a long-running stage, an interval
 * fires canned sub-narratives so the feed stays alive between transitions.
 *
 * Brand: dark surface, cyan brand accent (no purple), monospace for machine
 * values per .impeccable.md ("nerdy details earn their place").
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
  tag: string;
  text: string;
  /** Closed-out lines render slightly dimmer; the active line gets the cursor. */
  closed?: boolean;
}

// Short ALL-CAPS tag per stage label. Falls back to the first word uppercased
// if a stage label isn't in the table — easier than maintaining an exhaustive
// map for every variant the pipeline might emit.
const STAGE_TAGS: Record<string, string> = {
  // llm_v1 pipeline
  'Gathering live web sources for your angles': 'WEB',
  'Exploring each angle you set in your gameplan': 'EXPLORE',
  'Tightening sources and trimming overlap': 'DEDUPE',
  'Weaving findings into themes and narrative': 'SYNTH',
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

// Sub-narratives shown ~every 8s while a stage is active. Keep them concrete
// and machine-flavoured ("querying X", "computing Y") — generic affirmations
// like "thinking…" are exactly the AI-slop register we're trying to avoid.
const STAGE_SUBLINES: Record<string, string[]> = {
  'Gathering live web sources for your angles': [
    'querying SearXNG · DuckDuckGo backend',
    'fanning out URL fetches',
    'reading page text into evidence buffer',
    'scoring relevance per angle',
  ],
  'Exploring each angle you set in your gameplan': [
    'probing each angle independently',
    'extracting findings per angle',
    'tagging supporting quotes',
  ],
  'Tightening sources and trimming overlap': [
    'computing URL similarity',
    'merging duplicate citations',
  ],
  'Weaving findings into themes and narrative': [
    'clustering claims into themes',
    'composing the executive summary',
    'verifying every citation against the allowlist',
  ],
  'Shaping video directions from what we found': [
    'deriving short-form angles',
    'ranking ideas by predicted resonance',
  ],
  'Assembling your report': [
    'serializing the JSON payload',
    'persisting to topic_searches',
    'splitting platform sources across batches',
  ],
  'Searching the web': ['fetching SERP results', 'scoring candidates'],
  'Scanning Reddit discussions': ['fetching subreddit feeds', 'pulling top comments'],
  'Fetching YouTube videos & transcripts': ['enumerating channel uploads', 'pulling captions'],
  'Scraping TikTok & comments': ['hashtag enumeration', 'pulling top comments'],
  'Computing analytics': ['aggregating engagement', 'computing sentiment'],
  'Generating video ideas with AI': ['drafting hooks', 'ranking by virality'],
  'Building your report': ['rendering layout', 'persisting'],
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

const SUBLINE_INTERVAL_MS = 8000;
const MAX_LINES = 40;

export function ResearchConsole({ stages, stageIndex }: ResearchConsoleProps) {
  const [lines, setLines] = useState<LogLine[]>(() => [
    {
      ts: Date.now(),
      tag: 'INIT',
      text: 'cortex pipeline · llm_v1 — opening session',
      closed: true,
    },
  ]);
  const lastStageRef = useRef(-1);
  const sublinesEmittedRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // On stage change: close out the previous active line and append a new
  // "stage opening" line. Reset the subline counter so the next stage starts
  // its own narrative cycle.
  useEffect(() => {
    if (stageIndex < 0 || stageIndex >= stages.length) return;
    if (stageIndex === lastStageRef.current) return;
    const stage = stages[stageIndex];
    const tag = tagFor(stage.label);
    setLines((prev) => {
      const next = prev.length > 0
        ? [...prev.slice(0, -1), { ...prev[prev.length - 1], closed: true }]
        : prev;
      return [
        ...next,
        { ts: Date.now(), tag, text: stage.label.toLowerCase() + '…' },
      ].slice(-MAX_LINES);
    });
    lastStageRef.current = stageIndex;
    sublinesEmittedRef.current = 0;
  }, [stageIndex, stages]);

  // Within a stage: emit canned sublines on an interval so the feed doesn't
  // freeze during long phases (the merger LLM call can take 30–90s).
  useEffect(() => {
    const interval = setInterval(() => {
      if (stageIndex < 0 || stageIndex >= stages.length) return;
      const stage = stages[stageIndex];
      const subs = STAGE_SUBLINES[stage.label];
      if (!subs?.length) return;
      const idx = sublinesEmittedRef.current;
      if (idx >= subs.length) return;
      const text = subs[idx];
      sublinesEmittedRef.current = idx + 1;
      const tag = tagFor(stage.label);
      setLines((prev) => {
        const closed = prev.length > 0
          ? [...prev.slice(0, -1), { ...prev[prev.length - 1], closed: true }]
          : prev;
        return [...closed, { ts: Date.now(), tag, text }].slice(-MAX_LINES);
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

      {/* Log surface */}
      <div
        ref={scrollRef}
        className="max-h-[300px] min-h-[180px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]"
      >
        {lines.map((line, i) => {
          const isActive = i === lastIdx && !line.closed;
          return (
            <div
              key={`${line.ts}-${i}`}
              className={`flex gap-3 ${line.closed ? 'opacity-60' : 'opacity-100'} animate-fade-slide-in`}
            >
              <span className="shrink-0 tabular-nums text-text-muted/60">
                {formatClock(line.ts)}
              </span>
              <span className="w-[68px] shrink-0 truncate text-accent-text">
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
