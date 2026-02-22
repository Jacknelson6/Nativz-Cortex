'use client';

import { useState, useCallback } from 'react';
import { OnboardProgress } from '@/components/onboard/onboard-progress';
import { OnboardInput } from '@/components/onboard/onboard-input';
import { OnboardAnalyze } from '@/components/onboard/onboard-analyze';
import { OnboardProvision } from '@/components/onboard/onboard-provision';
import { OnboardStrategy } from '@/components/onboard/onboard-strategy';
import { OnboardReview } from '@/components/onboard/onboard-review';
import type { OnboardStep, OnboardFormData, ProvisionResult } from '@/lib/types/strategy';

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

  // Step 2 → Step 3
  function handleAnalyzeNext(data: OnboardFormData) {
    setFormData(data);
    completeStep('analyze');
    setCurrentStep('provision');
  }

  // Step 3 → Step 4
  const handleProvisionNext = useCallback((result: ProvisionResult & { clientId: string }) => {
    setClientId(result.clientId);
    completeStep('provision');
    setCurrentStep('strategy');
  }, []);

  // Step 4 → Step 5
  const handleStrategyNext = useCallback((id: string) => {
    setStrategyId(id);
    completeStep('strategy');
    setCurrentStep('review');
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page title — fades out after step 1 */}
      {currentStep === 'input' && (
        <div className="text-center mb-2 animate-fade-slide-in">
          <h1 className="text-2xl font-semibold text-text-primary">Onboard a new client</h1>
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

      {currentStep === 'provision' && formData && (
        <OnboardProvision
          formData={formData}
          onNext={handleProvisionNext}
          onBack={() => setCurrentStep('analyze')}
        />
      )}

      {currentStep === 'strategy' && (
        <OnboardStrategy
          clientId={clientId}
          clientName={formData?.name ?? ''}
          onNext={handleStrategyNext}
          onBack={() => setCurrentStep('provision')}
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
