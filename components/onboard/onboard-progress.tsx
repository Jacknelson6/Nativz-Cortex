'use client';

import { Stepper, type StepperStep } from '@/components/ui/stepper';
import type { OnboardStep } from '@/lib/types/strategy';

// Provisioning (Cortex insert + knowledge-graph sync + Monday board) used
// to be its own "Set up" step. We now run it silently during the Analyze
// to Strategy transition so the user doesn't sit through a redundant
// "creating records" screen.
const STEPS: StepperStep<OnboardStep>[] = [
  { key: 'input', label: 'Brand info' },
  { key: 'analyze', label: 'AI analysis' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'review', label: 'Review' },
];

interface OnboardProgressProps {
  currentStep: OnboardStep;
  completedSteps: OnboardStep[];
}

export function OnboardProgress({ currentStep, completedSteps }: OnboardProgressProps) {
  return (
    <Stepper
      steps={STEPS}
      currentStep={currentStep}
      completedSteps={completedSteps}
    />
  );
}
