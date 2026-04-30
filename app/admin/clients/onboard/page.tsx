'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OnboardProgress } from '@/components/onboard/onboard-progress';
import { OnboardInput } from '@/components/onboard/onboard-input';
import { OnboardAnalyze } from '@/components/onboard/onboard-analyze';
import { OnboardStrategy } from '@/components/onboard/onboard-strategy';
import { OnboardReview } from '@/components/onboard/onboard-review';
import type { OnboardStep, OnboardFormData } from '@/lib/types/strategy';

export default function OnboardWizardPage() {
  const [currentStep, setCurrentStep] = useState<OnboardStep>('input');
  const [completedSteps, setCompletedSteps] = useState<OnboardStep[]>([]);

  // State across steps
  const [inputData, setInputData] = useState<
    Pick<OnboardFormData, 'name' | 'website_url' | 'lifecycle_state'>
  >({
    name: '',
    website_url: '',
    lifecycle_state: 'lead',
  });
  const [formData, setFormData] = useState<OnboardFormData | null>(null);
  const [clientId, setClientId] = useState('');
  const [strategyId, setStrategyId] = useState('');
  // Guard against double-submission: React state updates are async so a
  // fast double-click on "Looks good — continue" can fire two POSTs to
  // /api/clients/onboard before `clientId` is set. A ref is synchronous
  // so the second call short-circuits immediately. Left dangling on error
  // so the user can retry manually.
  const onboardInFlight = useRef(false);

  function completeStep(step: OnboardStep) {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }

  // Step 1 → Step 2
  function handleInputNext(
    data: Pick<OnboardFormData, 'name' | 'website_url' | 'lifecycle_state'>,
  ) {
    setInputData(data);
    completeStep('input');
    setCurrentStep('analyze');
  }

  // Step 2 → Step 3 (analyze → strategy).
  // Provisioning (Cortex insert + knowledge-graph sync + Monday board)
  // runs silently here instead of as its own stepper step so the user
  // doesn't sit through a redundant "creating records" screen. Errors
  // surface as a toast and keep the user on the analyze step.
  const handleAnalyzeNext = useCallback(async (data: OnboardFormData) => {
    if (onboardInFlight.current) return;
    onboardInFlight.current = true;
    // Forward the lifecycle_state captured in step 1; analyze step doesn't
    // collect it, so merge it back in here before the POST.
    const requestBody = { ...data, lifecycle_state: inputData.lifecycle_state };
    setFormData(data);
    try {
      const res = await fetch('/api/clients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.cortex?.success || !payload?.cortex?.clientId) {
        const msg = payload?.error ?? payload?.cortex?.error ?? 'Failed to create client';
        toast.error(msg);
        onboardInFlight.current = false;
        return;
      }

      // Non-fatal: surface vault / monday failures as a warning but
      // keep going — the client record exists and strategy can proceed.
      if (payload.vault && payload.vault.success === false) {
        toast.warning(`Knowledge-graph sync skipped: ${payload.vault.error ?? 'unknown error'}`);
      }
      if (payload.monday && payload.monday.success === false) {
        toast.warning(`Monday.com board skipped: ${payload.monday.error ?? 'unknown error'}`);
      }

      setClientId(payload.cortex.clientId);
      completeStep('analyze');
      setCurrentStep('strategy');
    } catch {
      toast.error('Something went wrong creating the client, try again.');
      onboardInFlight.current = false;
    }
  }, [inputData.lifecycle_state]);

  // Step 3 → Step 4
  const handleStrategyNext = useCallback((id: string) => {
    setStrategyId(id);
    completeStep('strategy');
    setCurrentStep('review');
  }, []);

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto">
      {/* Page title, fades out after step 1 */}
      {currentStep === 'input' && (
        <div className="text-center mb-2 animate-fade-slide-in">
          <h1 className="ui-page-title">Add a new brand</h1>
        </div>
      )}

      {/* Progress indicator */}
      <OnboardProgress currentStep={currentStep} completedSteps={completedSteps} />

      {/* Step content */}
      {currentStep === 'input' && (
        <OnboardInput onNext={handleInputNext} />
      )}

      {currentStep === 'analyze' && (
        <OnboardAnalyze
          name={inputData.name}
          websiteUrl={inputData.website_url}
          onNext={handleAnalyzeNext}
          onBack={() => setCurrentStep('input')}
        />
      )}

      {currentStep === 'strategy' && (
        <OnboardStrategy
          clientId={clientId}
          clientName={formData?.name ?? ''}
          onNext={handleStrategyNext}
          onBack={() => setCurrentStep('analyze')}
        />
      )}

      {currentStep === 'review' && (
        <OnboardReview
          clientId={clientId}
          clientName={formData?.name ?? ''}
          strategyId={strategyId}
        />
      )}
    </div>
  );
}
