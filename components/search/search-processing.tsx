'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Loader2, AlertCircle, RotateCcw, Brain, Search,
  MessageSquare, Sparkles, FileText, Mail, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { PLATFORM_CONFIG } from './platform-icon';
import { toast } from 'sonner';

interface SearchProcessingProps {
  searchId: string;
  query: string;
  redirectPrefix: string;
  volume?: string;
  platforms?: string[];
}

const TIME_ESTIMATES: Record<string, { label: string }> = {
  light: { label: '30 sec – 1 min' },
  medium: { label: '1–3 min' },
  deep: { label: '3–8 min' },
  quick: { label: '30 sec – 1 min' },
};

const DEPTH_LABELS: Record<string, { label: string; color: string }> = {
  light: { label: 'Light', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  medium: { label: 'Medium', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  deep: { label: 'Deep', color: 'bg-accent2/10 text-accent2-text border-accent2/20' },
  quick: { label: 'Light', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
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
  const totalEst = isDeep ? 300000 : isMedium ? 120000 : 45000;

  const add = (label: string, icon: React.ReactNode, duration: number) => {
    cumulative += duration;
    stages.push({ label, icon, target: Math.min(92, (cumulative / totalEst) * 92), duration });
  };

  if (platforms.includes('web')) add('Searching the web', <Search size={14} />, isDeep ? 5000 : 3000);
  if (platforms.includes('reddit')) add('Scanning Reddit discussions', <MessageSquare size={14} />, isDeep ? 15000 : isMedium ? 8000 : 3000);
  if (platforms.includes('youtube')) {
    const YT = PLATFORM_CONFIG.youtube.icon;
    add('Fetching YouTube videos & transcripts', <YT size={14} className="text-red-400" />, isDeep ? 30000 : isMedium ? 15000 : 5000);
  }
  if (platforms.includes('tiktok')) {
    const TT = PLATFORM_CONFIG.tiktok.icon;
    add('Scraping TikTok & comments', <TT size={14} className="text-teal-400" />, isDeep ? 45000 : isMedium ? 20000 : 8000);
  }
  add('Computing analytics', <Brain size={14} />, isDeep ? 5000 : 3000);
  add('Generating video ideas with AI', <Sparkles size={14} />, isDeep ? 20000 : isMedium ? 12000 : 8000);
  add('Building your report', <FileText size={14} />, isDeep ? 5000 : 3000);

  return stages;
}

export function SearchProcessing({ searchId, query, redirectPrefix, volume = 'medium', platforms = ['web'] }: SearchProcessingProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const hasStarted = useRef(false);
  const intervalsRef = useRef<{ progress: ReturnType<typeof setInterval> | null; timer: ReturnType<typeof setInterval> | null }>({ progress: null, timer: null });

  // Memoize stages with useRef so they don't change between renders
  const stagesRef = useRef<Stage[]>(buildStages(platforms, volume));

  const timeEstimate = TIME_ESTIMATES[volume] ?? TIME_ESTIMATES.medium;
  const depth = DEPTH_LABELS[volume] ?? DEPTH_LABELS.medium;

  function clearIntervals() {
    if (intervalsRef.current.progress) clearInterval(intervalsRef.current.progress);
    if (intervalsRef.current.timer) clearInterval(intervalsRef.current.timer);
    intervalsRef.current = { progress: null, timer: null };
  }

  function startProgress() {
    clearIntervals();
    setProgress(0);
    setStageIndex(0);
    setDone(false);
    setElapsed(0);

    const stages = stagesRef.current;
    const startTime = Date.now();
    let currentProgress = 0;
    let currentStage = 0;

    intervalsRef.current.timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    intervalsRef.current.progress = setInterval(() => {
      const elapsedMs = Date.now() - startTime;

      let cumulativeDuration = 0;
      let targetStage = 0;
      for (let i = 0; i < stages.length; i++) {
        cumulativeDuration += stages[i].duration;
        if (elapsedMs < cumulativeDuration) { targetStage = i; break; }
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

  async function runProcess() {
    setError('');
    startProgress();

    try {
      const res = await fetch(`/api/search/${searchId}/process`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        clearIntervals();
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed.');
        setError(msg);
        return;
      }

      clearIntervals();
      setProgress(100);
      setStageIndex(stagesRef.current.length - 1);
      setDone(true);

      setTimeout(() => {
        router.push(`${redirectPrefix}/search/${searchId}`);
      }, 800);
    } catch {
      clearIntervals();
      setError('Something went wrong. Try again.');
    }
  }

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runProcess();
    return () => clearIntervals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRetry() {
    hasStarted.current = false;
    setError('');
    runProcess();
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

  const stages = stagesRef.current;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 animate-fade-slide-in">
      <div className="w-full max-w-md">
        {/* Heading */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent2-surface text-accent2-text text-xs font-medium">
              <Brain size={12} />
              AI research engine
            </div>
            <Badge className={`text-[10px] border ${depth.color}`}>{depth.label}</Badge>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">
            Researching &ldquo;{query}&rdquo;
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Estimated {timeEstimate.label} · {platforms.length} platform{platforms.length !== 1 ? 's' : ''}
          </p>
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
                  {isCurrent ? (
                    <EncryptedText text={stage.label} revealDelayMs={35} className="text-sm !font-medium" />
                  ) : (
                    stage.label
                  )}
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
