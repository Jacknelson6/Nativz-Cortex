'use client';

/**
 * Public onboarding stepper. Owns:
 *   - Local mirror of step_state + current_step (server is source of truth,
 *     but we mutate locally on PATCH to avoid an extra round-trip)
 *   - Per-screen rendering via a switch on screen.key
 *   - Submit handler that PATCHes /api/public/onboarding/[token] and
 *     auto-advances to the next screen on success
 *
 * The chrome (header logo, progress chip, screen title) is intentionally
 * minimal: brand-aware logo top-left, "step X of Y" top-right, big white
 * card with the screen content below. This is what the client sees, so
 * everything is sentence case and stripped of admin terminology.
 */

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2 } from 'lucide-react';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { OnboardingScreen } from '@/lib/onboarding/screens';
import type { OnboardingRow } from '@/lib/onboarding/types';
import { Button } from '@/components/ui/button';
import { BrandBasicsScreen } from '@/components/onboarding/screens/brand-basics';
import { SocialConnectScreen } from '@/components/onboarding/screens/social-connect';
import { ContentPrefsScreen } from '@/components/onboarding/screens/content-prefs';
import { AudienceToneScreen } from '@/components/onboarding/screens/audience-tone';
import { KickoffPickScreen } from '@/components/onboarding/screens/kickoff-pick';
import { ProjectBriefScreen } from '@/components/onboarding/screens/project-brief';
import { AssetLinkScreen } from '@/components/onboarding/screens/asset-link';
import { TurnaroundAckScreen } from '@/components/onboarding/screens/turnaround-ack';

export interface InitialOnboardingState {
  kind: OnboardingRow['kind'];
  platforms: string[];
  current_step: number;
  status: OnboardingRow['status'];
  step_state: Record<string, unknown>;
  completed_at: string | null;
}

interface Props {
  token: string;
  agency: AgencyBrand;
  clientName: string;
  clientLogoUrl: string | null;
  initial: InitialOnboardingState;
  screens: readonly OnboardingScreen[];
}

export function OnboardingStepper(props: Props) {
  const { token, agency, clientName, clientLogoUrl, initial, screens } = props;

  const [stepState, setStepState] = useState<Record<string, unknown>>(initial.step_state);
  const [currentStep, setCurrentStep] = useState(initial.current_step);
  const [status, setStatus] = useState<OnboardingRow['status']>(initial.status);
  const [completedAt, setCompletedAt] = useState<string | null>(initial.completed_at);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screen = screens[currentStep] ?? screens[screens.length - 1];
  const lastIndex = screens.length - 1;
  const isDone = currentStep >= lastIndex || status === 'completed';

  const progress = useMemo(() => ({
    pct: Math.round((Math.min(currentStep, lastIndex) / lastIndex) * 100),
    label: screen.label,
    current: Math.min(currentStep + 1, screens.length),
    total: screens.length,
  }), [currentStep, lastIndex, screen.label, screens.length]);

  /**
   * Submits step state for the current screen and advances to the next.
   * `value` is whatever the screen has stored locally; if the screen has
   * a step_state_key we merge it under that key. Otherwise we just bump
   * current_step (welcome screen, etc).
   */
  async function submitAndAdvance(value: Record<string, unknown> | null) {
    setSubmitting(true);
    setError(null);
    try {
      const next = Math.min(currentStep + 1, lastIndex);
      const body: Record<string, unknown> = {};
      if (screen.step_state_key && value) {
        body.step_state = { [screen.step_state_key]: value };
      }
      // If we're moving past the last step, mark complete; otherwise just advance.
      if (next === lastIndex && currentStep === lastIndex - 1) {
        body.complete = true;
      } else {
        body.advance_to = next;
      }

      const res = await fetch(`/api/public/onboarding/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Could not save your progress.');
      }
      const data = await res.json();
      setStepState(data.onboarding.step_state ?? {});
      setCurrentStep(data.onboarding.current_step ?? next);
      setStatus(data.onboarding.status);
      setCompletedAt(data.onboarding.completed_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  const screenValue = screen.step_state_key
    ? (stepState[screen.step_state_key] as Record<string, unknown> | undefined) ?? null
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8 sm:py-12">
      {/* Header */}
      <header className="flex items-center justify-between">
        <BrandLogo agency={agency} clientName={clientName} clientLogoUrl={clientLogoUrl} />
        <div className="text-xs uppercase tracking-wide text-text-muted">
          {isDone ? 'Done' : `Step ${progress.current} of ${progress.total}`}
        </div>
      </header>

      {/* Progress bar */}
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${isDone ? 100 : progress.pct}%` }}
        />
      </div>

      {/* Screen body */}
      <main className="mt-10 flex-1">
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {isDone ? (
          <DoneScreen clientName={clientName} kind={initial.kind} completedAt={completedAt} />
        ) : screen.key === 'welcome' ? (
          <WelcomeScreen
            clientName={clientName}
            kind={initial.kind}
            submitting={submitting}
            onStart={() => submitAndAdvance(null)}
          />
        ) : screen.key === 'brand_basics' ? (
          <BrandBasicsScreen
            value={screenValue}
            clientName={clientName}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'social_connect' ? (
          <SocialConnectScreen
            value={screenValue}
            platforms={initial.platforms}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'content_prefs' ? (
          <ContentPrefsScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'audience_tone' ? (
          <AudienceToneScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'kickoff_pick' ? (
          <KickoffPickScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'project_brief' ? (
          <ProjectBriefScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'asset_link' ? (
          <AssetLinkScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'turnaround_ack' ? (
          <TurnaroundAckScreen
            value={screenValue}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : null}
      </main>
    </div>
  );
}

function BrandLogo({
  agency,
  clientName,
  clientLogoUrl,
}: {
  agency: AgencyBrand;
  clientName: string;
  clientLogoUrl: string | null;
}) {
  if (clientLogoUrl) {
    return (
      <div className="flex items-center gap-2">
        <Image
          src={clientLogoUrl}
          alt={clientName}
          width={28}
          height={28}
          className="rounded-md object-contain"
        />
        <span className="text-sm font-medium text-text-primary">{clientName}</span>
      </div>
    );
  }
  // Fall back to agency logo as a quiet trust mark.
  const src = agency === 'anderson' ? '/anderson-logo-dark.svg' : '/nativz-logo.png';
  const alt = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
  return (
    <Image src={src} alt={alt} width={96} height={28} className="h-7 w-auto object-contain" />
  );
}

function WelcomeScreen({
  clientName,
  kind,
  submitting,
  onStart,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  submitting: boolean;
  onStart: () => void;
}) {
  const intro =
    kind === 'smm'
      ? 'A few quick questions and a kickoff pick. About 5 minutes. Your answers shape how we plan, film, and post for you.'
      : 'A short brief on what you want edited and a place to drop your raw footage. About 3 minutes.';
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">
          Welcome, {clientName}.
        </h1>
        <p className="text-base text-text-secondary">{intro}</p>
      </div>
      <Button onClick={onStart} disabled={submitting} size="lg">
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Loading...
          </>
        ) : (
          'Get started'
        )}
      </Button>
    </div>
  );
}

function DoneScreen({
  clientName,
  kind,
  completedAt,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  completedAt: string | null;
}) {
  const message =
    kind === 'smm'
      ? `That's everything we need to get started, ${clientName}. Your account manager will reach out within a business day to confirm your kickoff time.`
      : `Got it, ${clientName}. We'll grab your assets and have your first cut back within 5 to 7 business days. We'll email when it's ready for review.`;
  return (
    <div className="space-y-6">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-text">
        <Check size={20} />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">All set.</h1>
        <p className="text-base text-text-secondary">{message}</p>
      </div>
      {completedAt ? (
        <p className="text-xs text-text-muted">
          Completed {new Date(completedAt).toLocaleString()}.
        </p>
      ) : null}
    </div>
  );
}
