'use client';

import { Check } from 'lucide-react';

export interface StepperStep<TKey extends string = string> {
  key: TKey;
  label: string;
}

interface StepperProps<TKey extends string = string> {
  steps: StepperStep<TKey>[];
  currentStep: TKey;
  completedSteps: TKey[];
  className?: string;
}

/**
 * Horizontal numbered stepper with animated connector lines, originally
 * built for the onboard wizard. Reusable for any "first run" / multi-step
 * card surface (viewer-facing tool intros, kandy setup flows, etc.).
 *
 * Behavior:
 *   - Past steps fill the connector to 100% and render the circle in
 *     accent + check icon.
 *   - Current step glows with an accent ring; its incoming connector is
 *     half-filled.
 *   - Future steps render as muted numbered circles with no fill.
 */
export function Stepper<TKey extends string = string>({
  steps,
  currentStep,
  completedSteps,
  className,
}: StepperProps<TKey>) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div
      className={`flex items-center justify-between w-full max-w-2xl mx-auto mb-8 ${className ?? ''}`}
    >
      {steps.map((step, i) => {
        const isComplete = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;
        const isPast = i < currentIndex;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold
                  transition-all duration-500 ease-out
                  ${isComplete
                    ? 'bg-accent text-[color:var(--accent-contrast)] shadow-[0_0_12px_var(--accent-surface)]'
                    : isCurrent
                      ? 'bg-accent/20 text-accent border-2 border-accent shadow-[0_0_16px_var(--accent-surface)]'
                      : 'bg-surface-hover text-text-muted border border-nativz-border'
                  }
                `}
              >
                {isComplete ? (
                  <Check size={14} className="animate-fade-slide-in" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`
                  mt-2 text-xs font-medium whitespace-nowrap transition-colors duration-300
                  ${isCurrent ? 'text-accent' : isPast || isComplete ? 'text-text-secondary' : 'text-text-muted'}
                `}
              >
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
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
