'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Loader2, AlertCircle, RotateCcw, Brain, Search,
  MessageSquare, Sparkles, FileText, Mail, ArrowLeft, Layers, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLATFORM_CONFIG } from './platform-icon';
import { toast } from 'sonner';

interface SearchProcessingProps {
  searchId: string;
  query: string;
  redirectPrefix: string;
  volume?: string;
  platforms?: string[];
  /** `llm_v1` = subtopic pipeline; `legacy` = multi-platform scrape + analytics */
  pipeline?: 'legacy' | 'llm_v1';
  /** Confirmed subtopics count (llm_v1); defaults to 3 if unknown */
  subtopicCount?: number;
  /** Server-driven: Brave / OpenRouter web vs LLM-only subtopic synthesis */
  webResearchMode?: 'brave' | 'openrouter' | 'llm_only';
}

const TIME_ESTIMATES: Record<string, { label: string }> = {
  light: { label: '30 sec – 1 min' },
  medium: { label: '1–3 min' },
  deep: { label: '3–8 min' },
  quick: { label: '30 sec – 1 min' },
};

interface Stage {
  label: string;
  icon: React.ReactNode;
  target: number;
  duration: number;
}

function buildStages(platforms: string[], volume: string): Stage[] {
  const isDeep = volume === 'deep';
  const isMedium = volume === 'medium';
  const stages: Stage[] = [];
  let cumulative = 0;
  // Base timeline — multi-platform + LLM often needs several minutes; avoid jumping to “final” in <1 min.
  const platformCount = Math.max(1, platforms.filter((p) => p !== 'quora').length);
  const platformBoost = (platformCount - 1) * 45000;
  const totalEst =
    (isDeep ? 300000 : isMedium ? 180000 : 90000) + platformBoost;

  const add = (label: string, icon: React.ReactNode, duration: number) => {
    cumulative += duration;
    stages.push({ label, icon, target: Math.min(92, (cumulative / totalEst) * 92), duration });
  };

  if (platforms.includes('web')) add('Searching the web', <Search size={14} />, isDeep ? 5000 : 3000);
  if (platforms.includes('reddit')) add('Scanning Reddit discussions', <MessageSquare size={14} />, isDeep ? 15000 : isMedium ? 8000 : 3000);
  if (platforms.includes('youtube')) {
    const YT = PLATFORM_CONFIG.youtube.icon;
    add('Fetching YouTube videos & transcripts', <YT size={14} />, isDeep ? 30000 : isMedium ? 15000 : 5000);
  }
  if (platforms.includes('tiktok')) {
    const TT = PLATFORM_CONFIG.tiktok.icon;
    add('Scraping TikTok & comments', <TT size={14} />, isDeep ? 45000 : isMedium ? 20000 : 8000);
  }
  add('Computing analytics', <Brain size={14} />, isDeep ? 5000 : 3000);
  add('Generating video ideas with AI', <Sparkles size={14} />, isDeep ? 20000 : isMedium ? 12000 : 8000);
  add('Building your report', <FileText size={14} />, isDeep ? 120000 : isMedium ? 90000 : 60000);

  return stages;
}

function buildLlmStages(
  volume: string,
  subtopicCount: number,
  webResearch: 'brave' | 'openrouter' | 'llm_only'
): Stage[] {
  const isDeep = volume === 'deep';
  const isMedium = volume === 'medium';
  const n = Math.max(1, subtopicCount);
  const stages: Stage[] = [];
  let cumulative = 0;

  const liveWeb = webResearch === 'brave' || webResearch === 'openrouter';

  const perSubtopic =
    liveWeb
      ? isDeep
        ? 52000
        : isMedium
          ? 38000
          : 24000
      : isDeep
        ? 22000
        : isMedium
          ? 16000
          : 11000;

  const researchBlock = perSubtopic * n;
  const mergeMs = isDeep ? 35000 : isMedium ? 22000 : 14000;
  const ideasMs = isDeep ? 22000 : isMedium ? 14000 : 9000;
  const reportMs = isDeep ? 95000 : isMedium ? 70000 : 45000;

  const totalEst = researchBlock + mergeMs + ideasMs + reportMs;

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
  volume = 'medium',
  platforms = ['web'],
  pipeline = 'legacy',
  subtopicCount = 3,
  webResearchMode = 'llm_only',
}: SearchProcessingProps) {
  const router = useRouter();
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

  // Keep ref in sync so the interval closure can read it
  useEffect(() => {
    apiErrorRef.current = apiError !== null;
  }, [apiError]);

  const stages = useMemo(() => {
    if (pipeline === 'llm_v1') {
      return buildLlmStages(volume, subtopicCount, webResearchMode);
    }
    return buildStages(platforms, volume);
  }, [pipeline, platforms, volume, subtopicCount, webResearchMode]);

  const timeEstimate = TIME_ESTIMATES[volume] ?? TIME_ESTIMATES.medium;
  const isLlmPipeline = pipeline === 'llm_v1';

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

  function goToResults() {
    if (redirectOnceRef.current) return;
    redirectOnceRef.current = true;
    clearProcessingClock(searchId);
    stopStatusPoll();
    clearIntervals();
    setProgress(100);
    setStageIndex(stages.length - 1);
    setDone(true);
    setTimeout(() => {
      router.push(`${redirectPrefix}/search/${searchId}`);
    }, 400);
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
        currentProgress += Math.max(0.1, diff * 0.03);
        currentProgress = Math.min(currentProgress, stage.target);
        setProgress(currentProgress);
      }
    }, 100);
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
        clearIntervals();
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
      <div className="w-full max-w-md">
        {/* Heading */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-text-primary">
            Researching &ldquo;{query}&rdquo;
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {isLlmPipeline ? (
              <>
                Estimated {timeEstimate.label}
                {webResearchMode !== 'llm_only' ? ' · Including live web' : ''}
              </>
            ) : (
              <>
                Estimated {timeEstimate.label} · {platforms.length} platform
                {platforms.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
          {isLlmPipeline ? (
            <p className="text-xs text-text-muted/80 mt-2 max-w-sm mx-auto leading-relaxed">
              You&apos;ll see stages below: explore each angle, clean up sources, connect the story, sketch video
              ideas, then deliver your report. The bar is a rough guide, not a clock.
            </p>
          ) : (
            platforms.length > 1 && (
              <p className="text-xs text-text-muted/80 mt-2 max-w-sm mx-auto">
                Multi-platform research often needs a few minutes while the report is built — the bar is approximate.
              </p>
            )
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
            }}
          />
        </div>

        {/* Progress info row */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-muted tabular-nums">{formatElapsed(elapsed)} elapsed</span>
          <span className="text-xs text-text-muted tabular-nums">{Math.round(progress)}%</span>
        </div>

        {/* Stage steps */}
        <div className="mt-5 space-y-2">
          {stages.map((stage, i) => {
            const isComplete = i < stageIndex || done;
            const isCurrent = i === stageIndex && !done && !error;
            if (!isComplete && !isCurrent) return null;

            return (
              <div key={stage.label} className="flex items-center gap-2.5 animate-fade-slide-in">
                {isComplete ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
                    <Check size={12} className="text-accent" />
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-accent2-text" />
                  </div>
                )}
                <span className={`text-sm transition-colors ${isComplete ? 'text-text-muted' : 'text-text-primary font-medium'}`}>
                  {stage.label}
                </span>
              </div>
            );
          })}
          {done && (
            <div className="flex items-center gap-2.5 animate-fade-slide-in">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
                <Check size={12} className="text-emerald-400" />
              </div>
              <span className="text-sm text-emerald-400 font-medium">
                Research complete — opening your report
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!done && !error && elapsed > 10 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {!emailSent ? (
              <Button variant="outline" size="sm" onClick={handleEmailMe} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Email me when done
              </Button>
            ) : (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check size={12} /> We&apos;ll email you
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => router.push(`${redirectPrefix}/search/new`)}>
              <ArrowLeft size={12} />
              Back to research
            </Button>
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
