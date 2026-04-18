'use client';

import { useState, useCallback } from 'react';
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
  const [inputData, setInputData] = useState<Pick<OnboardFormData, 'name' | 'website_url'>>({
    name: '',
    website_url: '',
  });
  const [formData, setFormData] = useState<OnboardFormData | null>(null);
  const [clientId, setClientId] = useState('');
  const [strategyId, setStrategyId] = useState('');

  function completeStep(step: OnboardStep) {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }

  // Step 1 → Step 2
  function handleInputNext(data: Pick<OnboardFormData, 'name' | 'website_url'>) {
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
    setFormData(data);
    try {
      const res = await fetch('/api/clients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.cortex?.success || !payload?.cortex?.clientId) {
        const msg = payload?.error ?? payload?.cortex?.error ?? 'Failed to create client';
        toast.error(msg);
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
      toast.error('Something went wrong creating the client — try again.');
    }
  }, []);

  // Step 3 → Step 4
  const handleStrategyNext = useCallback((id: string) => {
    setStrategyId(id);
    completeStep('strategy');
    setCurrentStep('review');
  }, []);

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto">
      {/* Page title — fades out after step 1 */}
      {currentStep === 'input' && (
        <div className="text-center mb-2 animate-fade-slide-in">
          <h1 className="ui-page-title">Onboard a new client</h1>
          <p className="text-sm text-text-muted mt-1">
            From URL to full content strategy in 5 minutes
          </p>
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
