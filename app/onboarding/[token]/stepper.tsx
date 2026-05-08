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

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { AgencyTheme } from '@/lib/branding';
import type { OnboardingScreen } from '@/lib/onboarding/screens';
import type { OnboardingRow } from '@/lib/onboarding/types';
import { Button } from '@/components/ui/button';
import { StepStateView } from '@/components/onboarding/step-state-view';
import {
  BrandBasicsScreen,
  type BrandBasicsPrefill,
} from '@/components/onboarding/screens/brand-basics';
import { SocialConnectScreen } from '@/components/onboarding/screens/social-connect';
import { PointsOfContactScreen } from '@/components/onboarding/screens/points-of-contact';
import { FootageAndReferencesScreen } from '@/components/onboarding/screens/footage-and-references';

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
  theme: AgencyTheme;
  clientName: string;
  clientLogoUrl: string | null;
  brandPrefill: BrandBasicsPrefill;
  initial: InitialOnboardingState;
  screens: readonly OnboardingScreen[];
}

export function OnboardingStepper(props: Props) {
  const { token, agency, theme, clientName, clientLogoUrl, brandPrefill, initial, screens } = props;

  const [stepState, setStepState] = useState<Record<string, unknown>>(initial.step_state);
  const [currentStep, setCurrentStep] = useState(initial.current_step);
  const [status, setStatus] = useState<OnboardingRow['status']>(initial.status);
  const [completedAt, setCompletedAt] = useState<string | null>(initial.completed_at);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const lastAttemptRef = useRef<Record<string, unknown> | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const screen = screens[currentStep] ?? screens[screens.length - 1];
  const lastIndex = screens.length - 1;
  const isDone = currentStep >= lastIndex || status === 'completed';

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  useEffect(() => {
    if (!savedFlash) return;
    const id = window.setTimeout(() => setSavedFlash(false), 1800);
    return () => window.clearTimeout(id);
  }, [savedFlash]);

  const progress = useMemo(() => ({
    pct: Math.round((Math.min(currentStep, lastIndex) / lastIndex) * 100),
    label: screen.label,
    current: Math.min(currentStep + 1, screens.length),
    total: screens.length,
  }), [currentStep, lastIndex, screen.label, screens.length]);

  async function submitAndAdvance(value: Record<string, unknown> | null) {
    setSubmitting(true);
    setError(null);
    lastAttemptRef.current = value;
    try {
      const next = Math.min(currentStep + 1, lastIndex);
      const body: Record<string, unknown> = {};
      if (screen.step_state_key && value) {
        body.step_state = { [screen.step_state_key]: value };
      }
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
      lastAttemptRef.current = null;
      if (screen.step_state_key) setSavedFlash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  function retryLastSave() {
    if (submitting) return;
    submitAndAdvance(lastAttemptRef.current);
  }

  const screenValue = screen.step_state_key
    ? (stepState[screen.step_state_key] as Record<string, unknown> | undefined) ?? null
    : null;

  const isWelcome = !isDone && screen.key === 'welcome';

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-8 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <BrandLogo agency={agency} clientName={clientName} clientLogoUrl={clientLogoUrl} />
        <div className="flex items-center gap-2">
          {savedFlash ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-opacity"
            >
              <Check size={12} aria-hidden />
              Saved
            </span>
          ) : null}
          <div className="text-xs uppercase tracking-[0.12em] text-text-secondary">
            {isDone ? 'Done' : `Step ${progress.current} of ${progress.total}`}
          </div>
        </div>
      </header>

      <div className="mt-5 h-1 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${isDone ? 100 : progress.pct}%` }}
        />
      </div>

      <main
        className={
          isWelcome
            ? 'mt-12 sm:mt-16'
            : 'mt-10 flex-1'
        }
      >
        {error ? (
          <div
            ref={errorRef}
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          >
            <AlertTriangle size={14} className="shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">{error}</span>
            <button
              type="button"
              onClick={retryLastSave}
              disabled={submitting}
              className="shrink-0 rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-60"
            >
              {submitting ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : null}

        {isDone ? (
          <DoneScreen
            clientName={clientName}
            kind={initial.kind}
            theme={theme}
            completedAt={completedAt}
            stepState={stepState}
            screens={screens}
          />
        ) : screen.key === 'welcome' ? (
          <WelcomeScreen
            clientName={clientName}
            kind={initial.kind}
            theme={theme}
            submitting={submitting}
            onStart={() => submitAndAdvance(null)}
          />
        ) : screen.key === 'brand_basics' ? (
          <BrandBasicsScreen
            value={screenValue}
            clientName={clientName}
            prefill={brandPrefill}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'social_connect' ? (
          <SocialConnectScreen
            value={screenValue}
            platforms={initial.platforms}
            agency={theme}
            token={token}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'points_of_contact' ? (
          <PointsOfContactScreen
            value={screenValue}
            token={token}
            clientName={clientName}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
          />
        ) : screen.key === 'footage_and_references' ? (
          <FootageAndReferencesScreen
            value={screenValue}
            clientName={clientName}
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
      <div className="flex items-center gap-3">
        <Image
          src={clientLogoUrl}
          alt={clientName}
          width={36}
          height={36}
          className="rounded-md object-contain"
        />
        <span className="text-base font-medium text-text-primary">{clientName}</span>
      </div>
    );
  }
  const src = agency === 'anderson' ? '/anderson-logo-dark.svg' : '/nativz-logo.png';
  const alt = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
  return (
    <Image src={src} alt={alt} width={140} height={40} className="h-9 w-auto object-contain" />
  );
}

function WelcomeScreen({
  clientName,
  kind,
  theme,
  submitting,
  onStart,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  theme: AgencyTheme;
  submitting: boolean;
  onStart: () => void;
}) {
  const eyebrow =
    kind === 'smm' ? '5 quick steps · about 5 minutes' : '4 quick steps · about 3 minutes';
  const intro =
    kind === 'smm'
      ? 'Brand basics, then a couple of platform connections, then who we should email. Your answers shape how we plan, film, and post for you.'
      : `Quick partnership setup so we can hit the ground running. Brand basics, then a place to drop your footage and references. After that, our team books your kickoff.`;
  return (
    <div className="w-full rounded-[20px] border border-nativz-border bg-surface p-8 sm:p-12">
      <div className="space-y-7">
        <div className="space-y-3">
          <p className="text-sm font-medium italic text-accent-text">{eyebrow}</p>
          <h1 className="text-3xl font-semibold leading-tight text-text-primary sm:text-4xl">
            Welcome to our team,
            <br />
            {clientName}.
          </h1>
          <p className="text-base leading-relaxed text-text-secondary sm:text-lg">{intro}</p>
        </div>
        <Button
          onClick={onStart}
          disabled={submitting}
          size="lg"
          className="w-full rounded-full sm:w-auto"
        >
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
    </div>
  );
}

const EDITING_CADENCE: { label: string; detail: string }[] = [
  { label: 'Kickoff call', detail: 'We confirm scope, references, and the deliverable list.' },
  { label: 'Footage handoff', detail: 'You drop links here or share access. We pull what we need.' },
  { label: 'First cut', detail: 'Back to you within 5 to 7 business days.' },
  { label: 'Round 1 revisions', detail: 'You leave timestamped notes. We turn them around in 2 to 3 days.' },
  { label: 'Round 2 revisions', detail: 'Final polish pass. Usually 1 to 2 days.' },
  { label: 'Final delivery', detail: 'Master files plus platform-ready exports.' },
  { label: 'Next batch', detail: 'Same flow for the next deliverable in your package.' },
];

function DoneScreen({
  clientName,
  kind,
  theme,
  completedAt,
  stepState,
  screens,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  theme: AgencyTheme;
  completedAt: string | null;
  stepState: Record<string, unknown>;
  screens: readonly OnboardingScreen[];
}) {
  const opsEmail = theme.opsEmail ?? theme.supportEmail;
  const message =
    kind === 'smm'
      ? `That's everything we need to get started, ${clientName}. Your account manager will reach out within a business day to confirm your kickoff time.`
      : `Got it, ${clientName}. Our team will email you from ${opsEmail} within a business day to book your kickoff call. Here's what the partnership looks like from here:`;

  const sections = screens
    .filter((s) => s.step_state_key)
    .map((s) => {
      const key = s.step_state_key as string;
      const value = stepState[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 0) return null;
      return { key, label: s.label, value: record };
    })
    .filter((x): x is { key: string; label: string; value: Record<string, unknown> } => x !== null);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-text">
          <Check size={20} />
        </div>
        <div className="space-y-2">
          <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
            All set.
          </h1>
          <p className="text-base text-text-secondary">{message}</p>
        </div>
        {completedAt ? (
          <p className="text-xs text-text-secondary">
            Completed {new Date(completedAt).toLocaleString()}.
          </p>
        ) : null}
      </div>

      {kind === 'editing' ? (
        <ol className="space-y-3">
          {EDITING_CADENCE.map((item, idx) => (
            <li
              key={item.label}
              className="flex gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent-text">
                {idx + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-medium text-text-primary">{item.label}</div>
                <div className="text-xs text-text-secondary">{item.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {sections.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-[11px] uppercase tracking-wide text-text-secondary">
            Your answers
          </h2>
          <div className="space-y-3">
            {sections.map((section) => (
              <div
                key={section.key}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <h3 className="text-sm font-semibold text-text-primary">
                  {section.label}
                </h3>
                <StepStateView screenKey={section.key} value={section.value} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
