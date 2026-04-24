'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, ArrowDownToLine } from 'lucide-react';

interface LogEvent {
  id: string;
  created: number;
  type: string;
  text: string;
  source: 'build' | 'runtime' | string;
  statusCode?: number;
  path?: string;
}

interface Props {
  deploymentId: string;
  /** How often to poll the proxy (ms). 3s is the sweet spot for rate limits + freshness. */
  pollIntervalMs?: number;
  /** Cap the rendered log buffer so long-lived sessions don't eat memory. */
  maxEvents?: number;
}

/**
 * Live streaming log viewer for a Vercel deployment. Polls our admin-scoped
 * proxy endpoint (/api/admin/infrastructure/vercel-logs) forward from the
 * newest event we've seen and appends results. No click required — it
 * starts streaming on mount and sticks to the bottom of the viewport unless
 * the user scrolls up (at which point auto-scroll pauses and a "jump to
 * latest" affordance appears).
 */
export function LiveLogStream({
  deploymentId,
  pollIntervalMs = 3000,
  maxEvents = 500,
}: Props) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'live' | 'paused' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const lastSeenRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Initial backfill + polling loop.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchLogs(mode: 'initial' | 'poll') {
      if (cancelled) return;
      try {
        const url = new URL('/api/admin/infrastructure/vercel-logs', window.location.origin);
        url.searchParams.set('deploymentId', deploymentId);
        if (mode === 'initial') {
          url.searchParams.set('direction', 'backward');
          url.searchParams.set('limit', '80');
        } else {
          url.searchParams.set('direction', 'forward');
          url.searchParams.set('limit', '120');
          if (lastSeenRef.current > 0) {
            url.searchParams.set('since', String(lastSeenRef.current));
          }
        }
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `http ${res.status}`);
        }
        const { events: fresh } = (await res.json()) as { events: LogEvent[] };
        if (cancelled) return;

        if (fresh.length > 0) {
          setEvents((prev) => {
            const merged = [...prev];
            for (const e of fresh) {
              if (seenIdsRef.current.has(e.id)) continue;
              seenIdsRef.current.add(e.id);
              merged.push(e);
              if (e.created > lastSeenRef.current) lastSeenRef.current = e.created;
            }
            // Vercel returns backward-mode events newest→oldest; flip
            // those so the viewer reads top→bottom chronologically.
            merged.sort((a, b) => a.created - b.created);
            return merged.slice(-maxEvents);
          });
        }
        setStatus('live');
        setErrorMsg(null);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'unknown error');
      }
    }

    fetchLogs('initial').then(() => {
      if (cancelled) return;
      function loop() {
        if (cancelled) return;
        if (!paused) fetchLogs('poll');
        timer = setTimeout(loop, pollIntervalMs);
      }
      timer = setTimeout(loop, pollIntervalMs);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId, pollIntervalMs, maxEvents, paused]);

  // Auto-scroll to bottom on new events (unless the user scrolled up).
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, autoScroll]);

  // Detect "user scrolled up" so auto-scroll pauses gracefully.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
    setAutoScroll(atBottom);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  }

  return (
    <div className="flex h-[480px] flex-col overflow-hidden rounded-xl border border-nativz-border bg-nz-ink-2/70">
      <div className="flex items-center justify-between border-b border-nativz-border/60 bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            {status === 'error'
              ? `stream error · ${errorMsg ?? 'unknown'}`
              : status === 'loading'
                ? 'connecting…'
                : paused
                  ? 'paused'
                  : `live · polling every ${Math.round(pollIntervalMs / 1000)}s`}
          </span>
          <span className="font-mono text-[11px] text-text-muted/70">· {events.length} events</span>
        </div>
        <div className="flex items-center gap-1">
          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent-text transition-colors hover:bg-accent/15"
            >
              <ArrowDownToLine size={11} />
              Jump to latest
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent/50 hover:text-accent-text"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.5]"
      >
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-text-muted">
            {status === 'loading' ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Fetching the latest events from Vercel…
              </>
            ) : (
              'No log events yet. Requests and builds will appear here as they happen.'
            )}
          </div>
        ) : (
          events.map((e) => <LogLine key={e.id} event={e} />)
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: 'loading' | 'live' | 'paused' | 'error' }) {
  const tone =
    status === 'live'
      ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]'
      : status === 'error'
        ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.22)]'
        : status === 'paused'
          ? 'bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
          : 'bg-text-muted/50';
  const pulse = status === 'live' ? 'animate-pulse' : '';
  return <span className={`inline-block h-2 w-2 rounded-full ${tone} ${pulse}`} />;
}

function LogLine({ event }: { event: LogEvent }) {
  const sourceColor =
    event.source === 'build' ? 'text-accent-text/80' : 'text-emerald-300/90';
  const statusColor =
    event.statusCode != null
      ? event.statusCode >= 500
        ? 'text-red-400'
        : event.statusCode >= 400
          ? 'text-amber-300'
          : 'text-emerald-300/80'
      : 'text-text-muted/70';
  return (
    <div className="group flex items-start gap-3 py-0.5 hover:bg-surface-hover/30">
      <span className="w-20 shrink-0 text-text-muted/60">{formatTime(event.created)}</span>
      <span className={`w-14 shrink-0 font-medium uppercase tracking-wide ${sourceColor}`}>
        {event.source}
      </span>
      {event.statusCode != null && (
        <span className={`w-10 shrink-0 tabular-nums ${statusColor}`}>{event.statusCode}</span>
      )}
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-text-primary/90">
        {event.text}
      </span>
    </div>
  );
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
