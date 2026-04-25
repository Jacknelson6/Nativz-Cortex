'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Loader2, AlertCircle, RotateCcw, Brain, Search,
  MessageSquare, Sparkles, FileText, Mail, ArrowLeft, Layers, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLATFORM_CONFIG } from './platform-icon';
import { LoaderStepper } from './loader-stepper';
import { toast } from 'sonner';
import { useBackgroundSearch } from './background-search-tracker';

interface SearchProcessingProps {
  searchId: string;
  query: string;
  redirectPrefix: string;
  platforms?: string[];
  /** `llm_v1` = subtopic pipeline; `legacy` = multi-platform scrape + analytics */
  pipeline?: 'legacy' | 'llm_v1';
  /** Confirmed subtopics count (llm_v1); defaults to 3 if unknown */
  subtopicCount?: number;
  /** Server-driven: SearXNG / OpenRouter web vs LLM-only subtopic synthesis */
  webResearchMode?: 'searxng' | 'openrouter' | 'llm_only';
  /** When true, the search row is in `pending_subtopics` and the client must
   *  auto-run plan-subtopics + confirm before kicking off /process. */
  pendingSubtopics?: boolean;
}

interface Stage {
  label: string;
  icon: React.ReactNode;
  target: number;
  duration: number;
}

/**
 * Build the animated progress-bar stages for the legacy scrape pipeline.
 * Timing is a best-effort ETA used purely for UX — the actual run can take
 * longer or shorter; the real `done` signal comes from the poller.
 */
function buildStages(platforms: string[]): Stage[] {
  // Target ~4m31s total so the bar pacing matches the real average run.
  const entries: { label: string; icon: React.ReactNode; duration: number }[] = [];
  if (platforms.includes('web')) entries.push({ label: 'Searching the web', icon: <Search size={14} />, duration: 6000 });
  if (platforms.includes('reddit')) entries.push({ label: 'Scanning Reddit discussions', icon: <MessageSquare size={14} />, duration: 14_000 });
  if (platforms.includes('youtube')) {
    const YT = PLATFORM_CONFIG.youtube.icon;
    entries.push({ label: 'Fetching YouTube videos & transcripts', icon: <YT size={14} />, duration: 25_000 });
  }
  if (platforms.includes('tiktok')) {
    const TT = PLATFORM_CONFIG.tiktok.icon;
    entries.push({ label: 'Scraping TikTok & comments', icon: <TT size={14} />, duration: 30_000 });
  }
  entries.push({ label: 'Computing analytics', icon: <Brain size={14} />, duration: 6000 });
  entries.push({ label: 'Generating video ideas with AI', icon: <Sparkles size={14} />, duration: 20_000 });
  entries.push({ label: 'Building your report', icon: <FileText size={14} />, duration: 170_000 });

  const totalEst = entries.reduce((a, b) => a + b.duration, 0);
  const stages: Stage[] = [];
  let cumulative = 0;
  for (const e of entries) {
    cumulative += e.duration;
    stages.push({ label: e.label, icon: e.icon, target: Math.min(92, (cumulative / totalEst) * 92), duration: e.duration });
  }
  return stages;
}

/**
 * Build stages for the llm_v1 pipeline. Scales per-subtopic research time
 * by whether we're hitting a live SERP or doing LLM-only research.
 */
function buildLlmStages(
  subtopicCount: number,
  webResearch: 'searxng' | 'openrouter' | 'llm_only',
): Stage[] {
  const n = Math.max(1, subtopicCount);
  const liveWeb = webResearch === 'searxng' || webResearch === 'openrouter';
  // Target ~4m31s total run so the bar's pacing matches real averages.
  const perSubtopic = liveWeb ? 40_000 : 35_000;
  const researchBlock = perSubtopic * n;
  const mergeMs = 22_000;
  const ideasMs = 20_000;
  const reportMs = liveWeb ? 111_000 : 121_000;
  const totalEst = researchBlock + mergeMs + ideasMs + reportMs;

  const stages: Stage[] = [];
  let cumulative = 0;
  const add = (label: string, icon: React.ReactNode, duration: number) => {
    cumulative += duration;
    stages.push({ label, icon, target: Math.min(92, (cumulative / totalEst) * 92), duration });
  };

  const researchLabel = liveWeb
    ? 'Gathering live web sources for your angles'
    : 'Exploring each angle you set in your gameplan';

  add(researchLabel, <Layers size={14} />, researchBlock);
  add('Tightening sources and trimming overlap', <ShieldCheck size={14} />, mergeMs * 0.35);
  add('Weaving findings into themes and narrative', <Brain size={14} />, mergeMs * 0.65);
  add('Shaping video directions from what we found', <Sparkles size={14} />, ideasMs);
  add('Assembling your report', <FileText size={14} />, reportMs);

  return stages;
}

const PROCESS_POST_BY_ID = new Map<string, Promise<{ res: Response; data: unknown }>>();

function processingClockKey(id: string) {
  return `nativz-sp-t0:${id}`;
}

function clearProcessingClock(id: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(processingClockKey(id));
}

/** Derive stage + bar position from wall-clock elapsed (survives Strict Mode remounts). */
function progressFromElapsedMs(elapsedMs: number, stages: Stage[]) {
  let cumulativeDuration = 0;
  let currentStage = 0;
  for (let i = 0; i < stages.length; i++) {
    cumulativeDuration += stages[i].duration;
    if (elapsedMs < cumulativeDuration) {
      currentStage = i;
      break;
    }
    currentStage = i;
  }
  const stage = stages[currentStage];
  let stageStartMs = 0;
  for (let i = 0; i < currentStage; i++) {
    stageStartMs += stages[i].duration;
  }
  const within = Math.max(0, elapsedMs - stageStartMs);
  const frac = stage.duration > 0 ? Math.min(1, within / stage.duration) : 1;
  const prevTarget = currentStage > 0 ? stages[currentStage - 1].target : 0;
  const progress = Math.min(91, prevTarget + (stage.target - prevTarget) * (0.2 + 0.75 * frac));
  return { stageIndex: currentStage, progress };
}

export function SearchProcessing({
  searchId,
  query,
  redirectPrefix,
  platforms = ['web'],
  pipeline = 'legacy',
  subtopicCount = 3,
  webResearchMode = 'llm_only',
  pendingSubtopics = false,
}: SearchProcessingProps) {
  const router = useRouter();
  const { track: trackInBackground } = useBackgroundSearch();
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const apiErrorRef = useRef(false);
  const intervalsRef = useRef<{ progress: ReturnType<typeof setInterval> | null; timer: ReturnType<typeof setInterval> | null }>({ progress: null, timer: null });
  const pollStatusRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectOnceRef = useRef(false);

  /** Navigate away and track search for background toast notification */
  function goBackAndTrack() {
    trackInBackground({ id: searchId, query, redirectPrefix });
    toast.info('Research running in background — you\'ll be notified when it completes');
    router.push(`${redirectPrefix}/search/new`);
  }

  // Keep ref in sync so the interval closure can read it
  useEffect(() => {
    apiErrorRef.current = apiError !== null;
  }, [apiError]);

  const stages = useMemo(() => {
    if (pipeline === 'llm_v1') {
      return buildLlmStages(subtopicCount, webResearchMode);
    }
    return buildStages(platforms);
  }, [pipeline, platforms, subtopicCount, webResearchMode]);

  function clearIntervals() {
    if (intervalsRef.current.progress) clearInterval(intervalsRef.current.progress);
    if (intervalsRef.current.timer) clearInterval(intervalsRef.current.timer);
    intervalsRef.current = { progress: null, timer: null };
  }

  function stopStatusPoll() {
    if (pollStatusRef.current) {
      clearInterval(pollStatusRef.current);
      pollStatusRef.current = null;
    }
  }

  /**
   * Mark the search as finished. Previously this auto-redirected to the
   * results page after 400ms, but that behaviour disoriented users who
   * might have switched tabs / started other work during the search. New
   * behaviour: fire a success toast with a "View results" action button
   * (matches the background-search-tracker UX) and leave the user wherever
   * they are. The processing card swaps to a "done" state with its own
   * prominent "View results" button.
   */
  function goToResults() {
    if (redirectOnceRef.current) return;
    redirectOnceRef.current = true;
    clearProcessingClock(searchId);
    stopStatusPoll();
    clearIntervals();
    setProgress(100);
    setStageIndex(stages.length - 1);
    setDone(true);
    toast.success(`Research complete: "${query}"`, {
      duration: 10000,
      action: {
        label: 'View results',
        onClick: () => router.push(`${redirectPrefix}/search/${searchId}`),
      },
    });
  }

  function startProgress() {
    clearIntervals();
    setDone(false);

    const clockKey = processingClockKey(searchId);
    let t0 = Date.now();
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem(clockKey);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) t0 = parsed;
        else sessionStorage.setItem(clockKey, String(t0));
      } else {
        sessionStorage.setItem(clockKey, String(t0));
      }
    }

    const elapsedMs = Date.now() - t0;
    const seeded = progressFromElapsedMs(elapsedMs, stages);
    setStageIndex(seeded.stageIndex);
    setProgress(seeded.progress);
    setElapsed(Math.floor(elapsedMs / 1000));

    let currentProgress = seeded.progress;
    let currentStage = seeded.stageIndex;

    intervalsRef.current.timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);

    // Cadence: 500ms (was 100ms). The CSS on the bar already interpolates
    // smoothly between setState ticks (transition-all duration-300 ease-out),
    // so we don't need 10 renders/sec to look fluid. ~5x fewer re-renders
    // over a ~4m31s run without any visible change.
    intervalsRef.current.progress = setInterval(() => {
      if (apiErrorRef.current) return;

      const elapsedMsLoop = Date.now() - t0;

      let cumulativeDuration = 0;
      let targetStage = 0;
      for (let i = 0; i < stages.length; i++) {
        cumulativeDuration += stages[i].duration;
        if (elapsedMsLoop < cumulativeDuration) {
          targetStage = i;
          break;
        }
        targetStage = i;
      }

      if (targetStage !== currentStage) {
        currentStage = targetStage;
        setStageIndex(targetStage);
      }

      const stage = stages[currentStage];
      const diff = stage.target - currentProgress;
      if (diff > 0) {
        currentProgress += Math.max(0.5, diff * 0.15);
        currentProgress = Math.min(currentProgress, stage.target);
        setProgress(currentProgress);
      }
    }, 500);
  }

  async function pollUntilTerminal(maxAttempts = 450): Promise<void> {
    for (let i = 0; i < maxAttempts; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`/api/search/${searchId}`);
      if (!res.ok) continue;
      const row = await res.json();
      if (row.status === 'completed') return;
      if (row.status === 'failed') {
        throw new Error(row.summary || 'Search failed.');
      }
    }
    throw new Error(
      'This search is still running. Leave this tab open, or return in a few minutes.'
    );
  }

  function getOrCreateProcessPost(forceRetry: boolean) {
    if (forceRetry) {
      PROCESS_POST_BY_ID.delete(searchId);
    }
    let p = PROCESS_POST_BY_ID.get(searchId);
    if (p) return p;
    p = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
      try {
        const res = await fetch(`/api/search/${searchId}/process`, {
          method: 'POST',
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        return { res, data };
      } finally {
        clearTimeout(timeoutId);
        PROCESS_POST_BY_ID.delete(searchId);
      }
    })();
    PROCESS_POST_BY_ID.set(searchId, p);
    return p;
  }

  async function runProcess(opts?: { forceRetry?: boolean }) {
    const forceRetry = opts?.forceRetry ?? false;
    if (forceRetry) {
      redirectOnceRef.current = false;
      clearProcessingClock(searchId);
    }

    setError('');
    setApiError(null);
    apiErrorRef.current = false;
    startProgress();
    stopStatusPoll();

    pollStatusRef.current = setInterval(async () => {
      if (redirectOnceRef.current || apiErrorRef.current) return;
      try {
        const r = await fetch(`/api/search/${searchId}`);
        if (!r.ok) return;
        const row = await r.json();
        if (row.status === 'completed') {
          goToResults();
        } else if (row.status === 'failed') {
          stopStatusPoll();
          clearIntervals();
          const msg = typeof row.summary === 'string' ? row.summary : 'Search failed.';
          setError(msg);
          setApiError(msg);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);

    try {
      const { res, data } = await getOrCreateProcessPost(forceRetry);
      stopStatusPoll();

      if (res.status === 202) {
        // Stop the progress animator (we've capped at 88% pending poll), but
        // keep the elapsed-time ticker running so users see a live counter
        // instead of a frozen "9s" while polling can run for minutes.
        if (intervalsRef.current.progress) {
          clearInterval(intervalsRef.current.progress);
          intervalsRef.current.progress = null;
        }
        setStageIndex(stages.length - 2);
        setProgress(88);
        try {
          await pollUntilTerminal();
        } catch (pollErr) {
          const msg =
            pollErr instanceof Error ? pollErr.message : 'Something went wrong while waiting for results.';
          setError(msg);
          setApiError(msg);
          return;
        }
        goToResults();
        return;
      }

      if (!res.ok) {
        clearIntervals();
        const errBody = data as { error?: string; details?: string };
        const msg = errBody.details
          ? `${errBody.error ?? 'Error'}: ${errBody.details}`
          : (errBody.error || 'Search failed.');
        setError(msg);
        setApiError(msg);
        return;
      }

      goToResults();
    } catch (err) {
      stopStatusPoll();
      clearIntervals();
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Request timed out — the search took too long. Try again or use a lighter depth.'
        : 'Something went wrong. Try again.';
      setError(msg);
      setApiError(msg);
    }
  }

  /** Auto-confirm the LLM-pre-selected subtopics so the user never sees
   *  the keyword picker. Plans the gameplan, then PATCHes with all the
   *  returned keywords + start_processing. Returns true on success. */
  async function autoConfirmSubtopics(): Promise<boolean> {
    try {
      const planRes = await fetch(`/api/search/${searchId}/plan-subtopics`, {
        method: 'POST',
      });
      const planData = (await planRes.json()) as { subtopics?: string[]; error?: string };
      if (!planRes.ok) {
        setError(planData.error || 'Could not plan keywords. Try again.');
        setApiError(planData.error || 'Could not plan keywords.');
        return false;
      }
      const subtopics = (planData.subtopics ?? []).slice(0, 10);
      if (subtopics.length === 0) {
        setError('No keywords were generated. Try a different topic.');
        setApiError('No keywords generated.');
        return false;
      }
      const confirmRes = await fetch(`/api/search/${searchId}/subtopics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopics, start_processing: true }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        setError((body as { error?: string }).error || 'Could not start research.');
        setApiError((body as { error?: string }).error || 'Could not start research.');
        return false;
      }
      return true;
    } catch {
      setError('Failed to set up research. Try again.');
      setApiError('Failed to set up research.');
      return false;
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const check = await fetch(`/api/search/${searchId}`);
        if (check.ok) {
          const s = await check.json();
          if (s.status === 'completed') {
            clearProcessingClock(searchId);
            router.replace(`${redirectPrefix}/search/${searchId}`);
            return;
          }
          if (s.status === 'failed') {
            setError(s.summary || 'Search failed.');
            setApiError(s.summary || 'Search failed.');
            return;
          }
        }
      } catch {
        // Continue to kick processing
      }

      // llm_v1 carve-out: when the row is `pending_subtopics`, auto-run
      // plan + confirm first so the user lands here once and the loader
      // covers both the planning call and the actual research.
      if (pendingSubtopics) {
        const ok = await autoConfirmSubtopics();
        if (!ok) return;
      }
      runProcess();
    })();

    return () => {
      clearIntervals();
      stopStatusPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  function handleRetry() {
    stopStatusPoll();
    setError('');
    setApiError(null);
    runProcess({ forceRetry: true });
  }

  async function handleEmailMe() {
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/search/${searchId}/notify`, { method: 'POST' });
      if (res.ok) {
        setEmailSent(true);
        toast.success('We\'ll email you when it\'s ready');
      } else {
        toast.error('Failed to set up notification');
      }
    } catch {
      toast.error('Failed to set up notification');
    } finally {
      setSendingEmail(false);
    }
  }

  function formatElapsed(s: number) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 animate-fade-slide-in">
      <div className="w-full max-w-2xl">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold leading-tight text-text-primary">
            Researching <u className="nz-u">&ldquo;{query}&rdquo;</u>
          </h2>
        </div>

        {/* Stepper — vertical pipeline rail with the active step expanded
            to show a rotating sub-narrative. Replaces the earlier terminal-
            chrome console; same data driving it (stages + stageIndex), just
            a calmer visual register that doesn't grow indefinitely. */}
        {!done && !error && (
          <LoaderStepper stages={stages} stageIndex={stageIndex} />
        )}

        {/* Quiet meta line — single elapsed counter + stage pointer. The
            old thin progress bar + percentage was a redundant second
            indicator; the console feed is the primary "we're working"
            signal and this row gives a one-glance "where are we" pulse. */}
        {!done && !error && (
          <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-text-muted">
            <span className="tabular-nums">{formatElapsed(elapsed)} elapsed</span>
            <span className="tabular-nums">
              stage {Math.min(stageIndex + 1, stages.length)} of {stages.length}
            </span>
          </div>
        )}

        {/* Done state — sits in the same vertical slot as the console so
            the layout doesn't jump on completion. */}
        {done && (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 px-6 py-8 text-center animate-fade-slide-in">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
              <Check size={18} className="text-accent-text" />
            </div>
            <p className="mt-3 text-sm font-medium text-text-primary">Research complete</p>
            <p className="mt-1 font-mono text-[11px] text-text-muted">
              {formatElapsed(elapsed)} · {stages.length} stages
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => router.push(`${redirectPrefix}/search/${searchId}`)}
            >
              View results
            </Button>
          </div>
        )}

        {/* Action buttons — visible from the start. Sentence case per house
            style. */}
        {!done && !error && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBackAndTrack}>
              <ArrowLeft size={12} />
              Go back
            </Button>
            {!emailSent ? (
              <Button variant="outline" size="sm" onClick={handleEmailMe} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Email me when done
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-accent-text">
                <Check size={12} /> We&apos;ll email you
              </span>
            )}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400">{error}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RotateCcw size={14} />
                    Try again
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`${redirectPrefix}/search/new`)}>
                    <ArrowLeft size={14} />
                    Back
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
