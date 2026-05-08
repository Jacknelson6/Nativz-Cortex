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

  async function goBack() {
    if (submitting) return;
    if (currentStep <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const target = currentStep - 1;
      const res = await fetch(`/api/public/onboarding/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advance_to: target }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Could not go back.');
      }
      const data = await res.json();
      setStepState(data.onboarding.step_state ?? {});
      setCurrentStep(data.onboarding.current_step ?? target);
      setStatus(data.onboarding.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  const onBack = currentStep > 1 ? goBack : undefined;

  const screenValue = screen.step_state_key
    ? (stepState[screen.step_state_key] as Record<string, unknown> | undefined) ?? null
    : null;

  const isWelcome = !isDone && screen.key === 'welcome';

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl rounded-[20px] border border-nativz-border bg-surface p-8 sm:p-12">
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

      <div className="mt-5 h-1 overflow-hidden rounded-full bg-background/60">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${isDone ? 100 : progress.pct}%` }}
        />
      </div>

      <main
        className={
          isWelcome
            ? 'mt-10 sm:mt-12'
            : 'mt-8'
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
            stepState={stepState}
            screens={screens}
          />
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
            prefill={brandPrefill}
            token={token}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
            onBack={onBack}
          />
        ) : screen.key === 'social_connect' ? (
          <SocialConnectScreen
            value={screenValue}
            platforms={initial.platforms}
            agency={theme}
            token={token}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
            onBack={onBack}
          />
        ) : screen.key === 'points_of_contact' ? (
          <PointsOfContactScreen
            value={screenValue}
            token={token}
            clientName={clientName}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
            onBack={onBack}
          />
        ) : screen.key === 'footage_and_references' ? (
          <FootageAndReferencesScreen
            value={screenValue}
            clientName={clientName}
            submitting={submitting}
            onSubmit={(v) => submitAndAdvance(v)}
            onBack={onBack}
          />
        ) : null}
      </main>
      </div>
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
  submitting,
  onStart,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  submitting: boolean;
  onStart: () => void;
}) {
  const eyebrow =
    kind === 'smm' ? '5 quick steps · about 5 minutes' : '4 quick steps · about 3 minutes';
  const intro =
    kind === 'smm'
      ? 'Brand basics, then a couple of platform connections, then who we should email. Your answers shape how we plan, film, and post for you.'
      : 'Quick setup so we can hit the ground running.';
  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-medium italic text-accent-text">{eyebrow}</p>
        <h1 className="text-3xl font-semibold leading-tight text-text-primary sm:text-4xl">
          Welcome,
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

interface SummarySection {
  key: string;
  label: string;
  rows: SummaryRow[];
}

type SummaryRow =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'list'; label: string; items: string[] }
  | { kind: 'contacts'; label: string; items: { name: string; email: string }[] }
  | { kind: 'image'; label: string; url: string };

const BRAND_BASICS_FIELDS: { key: string; label: string }[] = [
  { key: 'website_url', label: 'Website' },
  { key: 'voice', label: 'Voice' },
  { key: 'current_offers', label: 'Current offers' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'what_we_sell', label: 'What we sell' },
  { key: 'audience', label: 'Audience' },
];

function buildSections(
  stepState: Record<string, unknown>,
  screens: readonly OnboardingScreen[],
): SummarySection[] {
  const out: SummarySection[] = [];
  for (const screen of screens) {
    if (!screen.step_state_key) continue;
    const raw = stepState[screen.step_state_key];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const rows: SummaryRow[] = [];

    if (screen.key === 'brand_basics') {
      const logoUrl = typeof record.logo_url === 'string' ? record.logo_url.trim() : '';
      if (logoUrl) rows.push({ kind: 'image', label: 'Logo', url: logoUrl });
      for (const f of BRAND_BASICS_FIELDS) {
        const v = record[f.key];
        if (typeof v === 'string' && v.trim().length > 0) {
          rows.push({ kind: 'text', label: f.label, value: v.trim() });
        }
      }
    } else if (screen.key === 'points_of_contact') {
      const contacts = Array.isArray(record.contacts)
        ? (record.contacts as Array<Record<string, unknown>>)
        : [];
      const items = contacts
        .map((c) => ({
          name: typeof c.name === 'string' ? c.name : '',
          email: typeof c.email === 'string' ? c.email : '',
        }))
        .filter((c) => c.name || c.email);
      if (items.length > 0) {
        rows.push({ kind: 'contacts', label: 'Contacts', items });
      }
    } else if (screen.key === 'footage_and_references') {
      const buckets: { key: keyof typeof record; label: string }[] = [
        { key: 'raw_footage_urls', label: 'Raw footage' },
        { key: 'reference_edit_urls', label: 'Reference edits' },
      ];
      for (const b of buckets) {
        const arr = record[b.key];
        if (Array.isArray(arr)) {
          const links = arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (links.length > 0) rows.push({ kind: 'list', label: b.label, items: links });
        }
      }
      if (typeof record.notes === 'string' && record.notes.trim().length > 0) {
        rows.push({ kind: 'text', label: 'Notes', value: record.notes.trim() });
      }
    } else if (screen.key === 'social_connect') {
      const handles = (record.handles as Record<string, unknown> | undefined) ?? {};
      const lines: string[] = [];
      for (const [platform, info] of Object.entries(handles)) {
        if (info && typeof info === 'object') {
          const handle = (info as Record<string, unknown>).handle;
          if (typeof handle === 'string' && handle.trim().length > 0) {
            lines.push(`${platform}: ${handle.trim()}`);
          }
        }
      }
      if (lines.length > 0) rows.push({ kind: 'list', label: 'Handles', items: lines });
    }

    if (rows.length > 0) {
      out.push({ key: screen.key, label: screen.label, rows });
    }
  }
  return out;
}

interface ConfettiParticle {
  x: number;
  y: number;
  rot: number;
}

function Confetti() {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  useEffect(() => {
    const count = 16;
    setParticles(
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 120 + Math.random() * 90;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.8 - 30;
        const rot = Math.round(Math.random() * 540 - 270);
        return { x, y, rot };
      }),
    );
  }, []);
  const colors = ['var(--accent)', 'var(--accent-text)', '#10B981', '#F59E0B'];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible"
    >
      {particles.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-0 h-2 w-2 rounded-sm"
          style={{
            backgroundColor: colors[i % colors.length],
            animation: `nz-confetti-${i} 1500ms ease-out forwards`,
            animationDelay: `${i * 30}ms`,
            opacity: 0,
          }}
        />
      ))}
      <style>{particles
        .map(
          (p, i) =>
            `@keyframes nz-confetti-${i} { 0% { opacity: 1; transform: translate(-50%, 0) rotate(0); } 100% { opacity: 0; transform: translate(calc(-50% + ${p.x.toFixed(0)}px), ${p.y.toFixed(0)}px) rotate(${p.rot}deg); } }`,
        )
        .join('\n')}</style>
    </div>
  );
}

function DoneScreen({
  clientName,
  kind,
  theme,
  stepState,
  screens,
}: {
  clientName: string;
  kind: OnboardingRow['kind'];
  theme: AgencyTheme;
  stepState: Record<string, unknown>;
  screens: readonly OnboardingScreen[];
}) {
  const opsEmail = theme.opsEmail ?? theme.supportEmail;
  const message =
    kind === 'smm'
      ? `That's everything we need to get started, ${clientName}. Sit back, we'll take it from here.`
      : `Got it, ${clientName}. Our team will email you from ${opsEmail} within a business day to book your kickoff call. Here's what the partnership looks like from here:`;

  const sections = buildSections(stepState, screens);

  return (
    <div className="relative space-y-10">
      <Confetti />

      <div className="space-y-4 text-center sm:text-left">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-text">
          <Check size={22} />
        </div>
        <div className="space-y-2">
          <h1 className="text-[30px] leading-tight font-semibold text-text-primary sm:text-[34px]">
            All set.
          </h1>
          <p className="text-base text-text-secondary leading-relaxed">{message}</p>
        </div>
      </div>

      {kind === 'editing' ? (
        <div>
          <h2 className="mb-3 text-[11px] uppercase tracking-wide text-text-secondary">
            What happens next
          </h2>
          <ol className="divide-y divide-nativz-border overflow-hidden rounded-xl border border-nativz-border bg-surface-hover/40">
            {EDITING_CADENCE.map((item, idx) => (
              <li key={item.label} className="flex gap-3 px-4 py-3">
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
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div>
          <h2 className="mb-3 text-[11px] uppercase tracking-wide text-text-secondary">
            Your answers
          </h2>
          <div className="divide-y divide-nativz-border overflow-hidden rounded-xl border border-nativz-border bg-surface-hover/40">
            {sections.map((section) => (
              <div key={section.key} className="px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{section.label}</h3>
                <dl className="mt-3 space-y-3">
                  {section.rows.map((row, i) => (
                    <SummaryRowView key={`${section.key}-${i}`} row={row} />
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRowView({ row }: { row: SummaryRow }) {
  if (row.kind === 'image') {
    return (
      <div className="flex items-center gap-3">
        <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-text-muted">
          {row.label}
        </dt>
        <dd className="min-w-0 flex-1">
          <Image
            src={row.url}
            alt={row.label}
            width={72}
            height={72}
            unoptimized
            className="h-14 w-14 rounded-md border border-nativz-border bg-background object-contain"
          />
        </dd>
      </div>
    );
  }
  if (row.kind === 'contacts') {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-text-muted pt-0.5">
          {row.label}
        </dt>
        <dd className="min-w-0 flex-1 space-y-1.5">
          {row.items.map((c, i) => (
            <div key={`${c.email}-${i}`} className="text-sm text-text-primary">
              <span className="font-medium">{c.name || c.email}</span>
              {c.name && c.email ? (
                <span className="text-text-muted"> &middot; {c.email}</span>
              ) : null}
            </div>
          ))}
        </dd>
      </div>
    );
  }
  if (row.kind === 'list') {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-text-muted pt-0.5">
          {row.label}
        </dt>
        <dd className="min-w-0 flex-1 space-y-1">
          {row.items.map((item, i) => {
            const isUrl = /^https?:\/\//i.test(item);
            return (
              <div key={`${item}-${i}`} className="break-all text-sm text-text-primary">
                {isUrl ? (
                  <a
                    href={item}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-text underline-offset-2 hover:underline"
                  >
                    {item}
                  </a>
                ) : (
                  item
                )}
              </div>
            );
          })}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start">
      <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-text-muted pt-0.5">
        {row.label}
      </dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-text-primary">
        {/^https?:\/\//i.test(row.value) ? (
          <a
            href={row.value}
            target="_blank"
            rel="noreferrer"
            className="break-all text-accent-text underline-offset-2 hover:underline"
          >
            {row.value}
          </a>
        ) : (
          row.value
        )}
      </dd>
    </div>
  );
}
