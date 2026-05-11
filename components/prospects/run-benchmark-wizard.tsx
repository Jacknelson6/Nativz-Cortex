'use client';

// SPY-05 T15: 3-step wizard.
//   1. Discover — POST /benchmark/discover, render candidates with rationale.
//   2. Confirm — strategist toggles up to 3 (or adds manual). Free-text rationale.
//   3. Run — POST /benchmark. Closes modal; page refreshes; progress component
//      mounts on the next render.
//
// Manual paste fallback covers cases where the LLM picker comes up empty
// or the strategist already has competitors in mind.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, X } from 'lucide-react';
import type {
  CompetitorPickSource,
  PickedCompetitor,
  ProspectPlatform,
} from '@/lib/prospects/types';

interface DiscoveredCandidate {
  platform: ProspectPlatform;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  rationale: string | null;
}

interface Props {
  prospectId: string;
  prospectHandle: string | null;
  defaultPlatform: ProspectPlatform;
  open: boolean;
  onClose: () => void;
}

type Step = 'discover' | 'confirm' | 'running' | 'error';

const PLATFORMS: ProspectPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

function normalise(handle: string): string {
  return handle.toLowerCase().replace(/^@+/, '').trim();
}

export function RunBenchmarkWizard({
  prospectId,
  prospectHandle,
  defaultPlatform,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('discover');
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveredCandidate[]>([]);
  const [picks, setPicks] = useState<PickedCompetitor[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual add form state.
  const [manualPlatform, setManualPlatform] = useState<ProspectPlatform>(defaultPlatform);
  const [manualHandle, setManualHandle] = useState('');

  if (!open) return null;

  async function runDiscover() {
    setDiscoverError(null);
    setStep('discover');
    try {
      const res = await fetch(`/api/prospects/${prospectId}/benchmark/discover`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDiscoverError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setCandidates(json.candidates ?? []);
      setStep('confirm');
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : 'Discovery failed');
    }
  }

  function togglePick(c: DiscoveredCandidate, source: CompetitorPickSource = 'discovered') {
    const key = `${c.platform}:${normalise(c.handle)}`;
    const isPicked = picks.some(
      (p) => `${p.platform}:${normalise(p.handle)}` === key,
    );
    if (isPicked) {
      setPicks(picks.filter((p) => `${p.platform}:${normalise(p.handle)}` !== key));
      return;
    }
    if (picks.length >= 3) return;
    setPicks([
      ...picks,
      {
        platform: c.platform,
        handle: c.handle,
        display_name: c.display_name,
        profile_url: c.profile_url,
        source,
        rationale: c.rationale,
      },
    ]);
  }

  function addManual() {
    const handle = manualHandle.trim();
    if (!handle) return;
    if (
      prospectHandle &&
      normalise(handle) === normalise(prospectHandle)
    ) {
      setErrorMessage("Can't benchmark a prospect against themselves.");
      return;
    }
    togglePick(
      {
        platform: manualPlatform,
        handle,
        display_name: null,
        profile_url: null,
        rationale: null,
      },
      'manual',
    );
    setManualHandle('');
    setErrorMessage(null);
  }

  async function runBenchmark() {
    if (picks.length === 0) {
      setErrorMessage('Pick at least 1 competitor.');
      return;
    }
    setErrorMessage(null);
    setStep('running');
    try {
      const res = await fetch(`/api/prospects/${prospectId}/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitors: picks }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setErrorMessage(
            json.error +
              (json.retry_after_seconds
                ? ` Try again in ${Math.ceil(json.retry_after_seconds / 60)} min.`
                : ''),
          );
        } else {
          setErrorMessage(json.error ?? `HTTP ${res.status}`);
        }
        setStep('error');
        return;
      }
      router.refresh();
      onClose();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Benchmark failed');
      setStep('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Benchmark vs competitors
            </h2>
            <p className="text-xs text-text-muted">
              Pick up to 3 competitors. We'll scrape + grade each on the same checklist.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {step === 'discover' && (
          <div className="space-y-3">
            {discoverError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {discoverError}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-text-muted">
                <Loader2 size={14} className="animate-spin text-accent" />
                Finding lookalike competitors…
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={runDiscover}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                {discoverError ? 'Retry discovery' : 'Start discovery'}
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Skip — add manually
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Suggestions {candidates.length > 0 ? `(${candidates.length})` : ''}
              </div>
              {candidates.length === 0 ? (
                <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
                  No suggestions — add competitors manually below.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {candidates.map((c) => {
                    const key = `${c.platform}:${normalise(c.handle)}`;
                    const isPicked = picks.some(
                      (p) => `${p.platform}:${normalise(p.handle)}` === key,
                    );
                    return (
                      <li
                        key={key}
                        className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => togglePick(c)}
                          disabled={!isPicked && picks.length >= 3}
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            isPicked
                              ? 'border-accent bg-accent text-white'
                              : 'border-border bg-background'
                          } disabled:opacity-30`}
                        >
                          {isPicked && <Check size={12} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm text-foreground">
                            <span className="font-medium">@{c.handle}</span>
                            <span className="text-xs text-text-muted">{c.platform}</span>
                          </div>
                          {c.rationale && (
                            <div className="mt-0.5 text-xs text-text-muted">
                              {c.rationale}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Add manually
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={manualPlatform}
                  onChange={(e) => setManualPlatform(e.target.value as ProspectPlatform)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="@handle"
                  value={manualHandle}
                  onChange={(e) => setManualHandle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManual();
                    }
                  }}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={addManual}
                  disabled={picks.length >= 3}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>

            {picks.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Picked ({picks.length}/3)
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {picks.map((p) => {
                    const key = `${p.platform}:${normalise(p.handle)}`;
                    return (
                      <li
                        key={key}
                        className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent"
                      >
                        <span>
                          @{p.handle}
                          <span className="ml-1 text-[10px] text-text-muted">{p.platform}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPicks(
                              picks.filter(
                                (x) =>
                                  `${x.platform}:${normalise(x.handle)}` !== key,
                              ),
                            )
                          }
                          className="text-text-muted hover:text-foreground"
                        >
                          <X size={10} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {errorMessage}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runBenchmark}
                disabled={picks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Run benchmark
              </button>
            </div>
          </div>
        )}

        {step === 'running' && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin text-accent" />
            Kicking off benchmark…
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
              {errorMessage ?? 'Failed to run benchmark.'}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
