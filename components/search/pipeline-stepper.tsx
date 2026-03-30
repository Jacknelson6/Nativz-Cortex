'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, Loader2, AlertCircle, Clock } from 'lucide-react';

interface PipelineStepData {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

interface PipelineStepperProps {
  searchId: string;
  /** Called when the search status from /steps is 'completed' or 'failed' */
  onStatusChange?: (status: string) => void;
}

function formatStepDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function PipelineStepper({ searchId, onStatusChange }: PipelineStepperProps) {
  const [steps, setSteps] = useState<PipelineStepData[]>([]);
  const [searchStatus, setSearchStatus] = useState<string>('processing');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchSteps() {
      try {
        const res = await fetch(`/api/search/${searchId}/steps`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setSteps(data.steps ?? []);
        if (data.status && data.status !== searchStatus) {
          setSearchStatus(data.status);
          onStatusChange?.(data.status);
        }
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (tickRef.current) clearInterval(tickRef.current);
        }
      } catch {
        // Ignore transient errors
      }
    }

    fetchSteps();
    pollRef.current = setInterval(fetchSteps, 2000);
    // Tick every second to update active step duration
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  if (steps.length === 0) return null;

  return (
    <div className="mt-5 space-y-1">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={step.id} className="flex items-start gap-3">
            {/* Connector line + icon */}
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} />
              {!isLast && (
                <div
                  className={`w-px h-5 mt-0.5 ${
                    step.status === 'completed'
                      ? 'bg-emerald-500/40'
                      : 'bg-nativz-border'
                  }`}
                />
              )}
            </div>
            {/* Label + duration */}
            <div className="flex-1 min-w-0 -mt-0.5">
              <span
                className={`text-sm transition-colors ${
                  step.status === 'active'
                    ? 'text-text-primary font-medium'
                    : step.status === 'completed'
                      ? 'text-text-muted'
                      : step.status === 'failed'
                        ? 'text-red-400'
                        : 'text-text-muted/50'
                }`}
              >
                {step.label}
              </span>
              {(step.status === 'active' || step.status === 'completed') && step.startedAt && (
                <span className="ml-2 text-[11px] text-text-muted/60 tabular-nums">
                  {formatStepDuration(step.startedAt, step.completedAt)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepIcon({ status }: { status: PipelineStepData['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
          <Check size={12} className="text-emerald-400" />
        </div>
      );
    case 'active':
      return (
        <div className="flex h-5 w-5 items-center justify-center">
          <Loader2 size={14} className="animate-spin text-accent2-text" />
        </div>
      );
    case 'failed':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15">
          <AlertCircle size={12} className="text-red-400" />
        </div>
      );
    default:
      return (
        <div className="flex h-5 w-5 items-center justify-center">
          <Clock size={12} className="text-text-muted/30" />
        </div>
      );
  }
}
