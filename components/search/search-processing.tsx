'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';

interface SearchProcessingProps {
  searchId: string;
  query: string;
  redirectPrefix: string;
}

const PROGRESS_STAGES = [
  { label: 'Searching the web', target: 20, duration: 3000 },
  { label: 'Gathering discussions & videos', target: 40, duration: 5000 },
  { label: 'Analyzing with AI', target: 65, duration: 15000 },
  { label: 'Structuring your report', target: 85, duration: 20000 },
  { label: 'Finalizing results', target: 92, duration: 30000 },
];

export function SearchProcessing({ searchId, query, redirectPrefix }: SearchProcessingProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const progressRef = useRef<ReturnType<typeof setInterval>>(null);
  const hasStarted = useRef(false);

  const startProgress = useCallback(() => {
    setProgress(0);
    setStageIndex(0);
    setDone(false);

    let currentProgress = 0;
    let currentStage = 0;
    const startTime = Date.now();

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;

      let cumulativeDuration = 0;
      let targetStage = 0;
      for (let i = 0; i < PROGRESS_STAGES.length; i++) {
        cumulativeDuration += PROGRESS_STAGES[i].duration;
        if (elapsed < cumulativeDuration) {
          targetStage = i;
          break;
        }
        targetStage = i;
      }

      if (targetStage !== currentStage) {
        currentStage = targetStage;
        setStageIndex(targetStage);
      }

      const stage = PROGRESS_STAGES[currentStage];
      const diff = stage.target - currentProgress;

      if (diff > 0) {
        currentProgress += Math.max(0.1, diff * 0.03);
        currentProgress = Math.min(currentProgress, stage.target);
        setProgress(currentProgress);
      }
    }, 100);
  }, []);

  const runProcess = useCallback(async () => {
    setError('');
    startProgress();

    try {
      const res = await fetch(`/api/search/${searchId}/process`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        if (progressRef.current) clearInterval(progressRef.current);
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed.');
        setError(msg);
        return;
      }

      // Complete
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setStageIndex(PROGRESS_STAGES.length - 1);
      setDone(true);

      setTimeout(() => {
        router.push(`${redirectPrefix}/search/${searchId}`);
      }, 600);
    } catch {
      if (progressRef.current) clearInterval(progressRef.current);
      setError('Something went wrong. Try again.');
    }
  }, [searchId, redirectPrefix, router, startProgress]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runProcess();

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [runProcess]);

  function handleRetry() {
    hasStarted.current = false;
    setError('');
    runProcess();
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Heading */}
        <div className="text-center mb-8">
          <p className="text-lg font-semibold text-text-primary mb-1">
            Researching &ldquo;{query}&rdquo;
          </p>
          <p className="text-sm text-text-muted">This usually takes 1–2 minutes</p>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-[#0580f0] transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Percentage */}
        <p className="mt-2 text-xs text-text-muted text-right tabular-nums">
          {Math.round(progress)}%
        </p>

        {/* Stage steps — only show completed + current, animate in */}
        <div className="mt-4 space-y-2">
          {PROGRESS_STAGES.map((stage, i) => {
            const isComplete = i < stageIndex || done;
            const isCurrent = i === stageIndex && !done && !error;
            const isVisible = isComplete || isCurrent;

            if (!isVisible) return null;

            return (
              <div
                key={stage.label}
                className="flex items-center gap-2.5 animate-fade-slide-in"
              >
                {isComplete ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
                    <Check size={12} className="text-accent" />
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-accent" />
                  </div>
                )}
                <span className={`text-sm transition-colors ${
                  isComplete ? 'text-text-muted' : 'text-text-primary font-medium'
                }`}>
                  {isCurrent ? (
                    <EncryptedText text={stage.label} revealDelayMs={40} className="text-sm !font-medium" />
                  ) : (
                    stage.label
                  )}
                </span>
              </div>
            );
          })}
          {done && (
            <div className="flex items-center gap-2.5 animate-fade-slide-in">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
                <Check size={12} className="text-accent" />
              </div>
              <span className="text-sm text-accent font-medium">Done — opening your report</span>
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="mt-3"
                >
                  <RotateCcw size={14} />
                  Try again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
