'use client';

import { Check } from 'lucide-react';
import type { OnboardStep } from '@/lib/types/strategy';

const STEPS: { key: OnboardStep; label: string; number: number }[] = [
  { key: 'input', label: 'Client info', number: 1 },
  { key: 'analyze', label: 'AI analysis', number: 2 },
  { key: 'provision', label: 'Set up', number: 3 },
  { key: 'strategy', label: 'Strategy', number: 4 },
  { key: 'review', label: 'Review', number: 5 },
];

interface OnboardProgressProps {
  currentStep: OnboardStep;
  completedSteps: OnboardStep[];
}

export function OnboardProgress({ currentStep, completedSteps }: OnboardProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-between w-full max-w-2xl mx-auto mb-8">
      {STEPS.map((step, i) => {
        const isComplete = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;
        const isPast = i < currentIndex;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold
                  transition-all duration-500 ease-out
                  ${isComplete
                    ? 'bg-accent text-white shadow-[0_0_12px_rgba(4,107,210,0.4)]'
                    : isCurrent
                      ? 'bg-accent/20 text-accent border-2 border-accent shadow-[0_0_16px_rgba(4,107,210,0.25)]'
                      : 'bg-surface-hover text-text-muted border border-nativz-border'
                  }
                `}
              >
                {isComplete ? (
                  <Check size={14} className="animate-fade-slide-in" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`
                  mt-2 text-[11px] font-medium whitespace-nowrap transition-colors duration-300
                  ${isCurrent ? 'text-accent' : isPast || isComplete ? 'text-text-secondary' : 'text-text-muted'}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className="flex-1 mx-3 mt-[-20px]">
                <div className="h-0.5 rounded-full bg-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                    style={{ width: isPast || isComplete ? '100%' : isCurrent ? '50%' : '0%' }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
