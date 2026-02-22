'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Loader2, AlertCircle, RotateCcw, Brain, Search, FileText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';

interface OnboardStrategyProps {
  clientId: string;
  clientName: string;
  onNext: (strategyId: string) => void;
  onBack: () => void;
}

const STAGES = [
  { label: 'Researching industry trends', icon: <Search size={14} />, target: 20, duration: 5000 },
  { label: 'Analyzing competitive landscape', icon: <Brain size={14} />, target: 45, duration: 12000 },
  { label: 'Building content strategy', icon: <Sparkles size={14} />, target: 70, duration: 20000 },
  { label: 'Generating video ideas', icon: <FileText size={14} />, target: 88, duration: 25000 },
  { label: 'Compiling your playbook', icon: <FileText size={14} />, target: 95, duration: 30000 },
];

export function OnboardStrategy({ clientId, clientName, onNext, onBack }: OnboardStrategyProps) {
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

      for (let i = 0; i < STAGES.length; i++) {
        cumulativeDuration += STAGES[i].duration;
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

      const stage = STAGES[currentStage];
      const diff = stage.target - currentProgress;
      if (diff > 0) {
        currentProgress += Math.max(0.1, diff * 0.025);
        currentProgress = Math.min(currentProgress, stage.target);
        setProgress(currentProgress);
      }
    }, 100);
  }, []);

  const generate = useCallback(async () => {
    setError('');
    startProgress();

    try {
      const res = await fetch(`/api/clients/${clientId}/strategy`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        if (progressRef.current) clearInterval(progressRef.current);
        setError(data.details || data.error || 'Strategy generation failed.');
        return;
      }

      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setStageIndex(STAGES.length - 1);
      setDone(true);

      setTimeout(() => {
        onNext(data.strategyId);
      }, 800);
    } catch {
      if (progressRef.current) clearInterval(progressRef.current);
      setError('Something went wrong. Try again.');
    }
  }, [clientId, onNext, startProgress]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    generate();

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [generate]);

  return (
    <div className="animate-fade-slide-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(139,92,246,0.1)] text-[#8B5CF6] text-xs font-medium mb-4">
          <Brain size={12} />
          AI strategy engine
        </div>
        <h2 className="text-xl font-semibold text-text-primary">
          Building {clientName}&apos;s content playbook
        </h2>
        <p className="text-sm text-text-muted mt-1">
          This takes 1–3 minutes — crafting a full brand strategy
        </p>
      </div>

      <div className="max-w-md mx-auto">
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, #046BD2, #8B5CF6)`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-text-muted text-right tabular-nums">
          {Math.round(progress)}%
        </p>

        {/* Stages */}
        <div className="mt-4 space-y-2">
          {STAGES.map((stage, i) => {
            const isComplete = i < stageIndex || done;
            const isCurrent = i === stageIndex && !done && !error;
            const isVisible = isComplete || isCurrent;

            if (!isVisible) return null;

            return (
              <div key={stage.label} className="flex items-center gap-2.5 animate-fade-slide-in">
                {isComplete ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
                    <Check size={12} className="text-accent" />
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-[#8B5CF6]" />
                  </div>
                )}
                <span className={`text-sm transition-colors ${
                  isComplete ? 'text-text-muted' : 'text-text-primary font-medium'
                }`}>
                  {isCurrent ? (
                    <EncryptedText text={stage.label} revealDelayMs={35} className="text-sm !font-medium" />
                  ) : stage.label}
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
                Strategy complete — preparing your review
              </span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400">{error}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={onBack}>
                    Go back
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    hasStarted.current = false;
                    setError('');
                    generate();
                  }}>
                    <RotateCcw size={14} />
                    Try again
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
