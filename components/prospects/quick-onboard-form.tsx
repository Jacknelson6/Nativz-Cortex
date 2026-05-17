'use client';

// SPY-02 T10: the main confirm-platforms surface. State machine:
//   idle → detecting → confirm → done   (or → error from any step)
//
// Keeps the user inside one component so there's no full-page redirect
// between paste and confirm — the rep stays oriented for the whole
// flow. After save, we hand off to /admin/prospects/[id].

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertTriangle, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PlatformConfirmRow, type ConfirmRowPlatform } from './platform-confirm-row';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

type AgencyChoice = 'Nativz' | 'Anderson Collaborative';

type Step = 'idle' | 'detecting' | 'confirm' | 'done' | 'error';

interface DetectionResponse {
  prospect: { id: string; brand_name: string; website_url: string | null };
  detection: {
    classified_as: 'website' | 'social_profile';
    platform_seed: ConfirmRowPlatform | null;
    brand_name: string;
    favicon_url: string | null;
    website_url: string | null;
    socials: Array<{
      platform: ConfirmRowPlatform;
      handle: string;
      profile_url: string | null;
      display_name: string | null;
      confidence: 'high' | 'medium' | 'low';
      candidates: Array<{ handle: string; profile_url: string; reason: string }>;
    }>;
    detection_failed: boolean;
    detection_message: string | null;
  };
  existed: boolean;
}

const PLATFORMS: ConfirmRowPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

interface RowState {
  detection: {
    handle: string | null;
    profile_url: string | null;
    confidence: 'high' | 'medium' | 'low';
    candidates: Array<{ handle: string; profile_url: string; reason: string }>;
  };
  included: boolean;
  manualOverride: { handle: string; profile_url: string } | null;
}

function emptyRow(): RowState {
  return {
    detection: { handle: null, profile_url: null, confidence: 'low', candidates: [] },
    included: false,
    manualOverride: null,
  };
}

export function QuickOnboardForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode: brandMode } = useBrandMode();
  // Prefill from query params — the client onboard wizard forwards
  // brand name + URL + agency here when the user picks "Prospect" so
  // they don't retype.
  const prefillUrl = searchParams?.get('prefill_url') ?? '';
  const prefillName = searchParams?.get('prefill_name') ?? '';
  const prefillAgencyParam = searchParams?.get('prefill_agency');
  const prefillAgency: AgencyChoice | null =
    prefillAgencyParam === 'Anderson Collaborative' || prefillAgencyParam === 'Nativz'
      ? prefillAgencyParam
      : null;
  const [url, setUrl] = useState(prefillUrl);
  // Required tag: every prospect MUST be filed under an agency at creation
  // so downstream emails / share links / PDFs brand correctly. Defaults to
  // the prefill (if forwarded from the client onboard wizard) or the
  // current dashboard brand mode. Post-Victory incident hardening.
  const [agency, setAgency] = useState<AgencyChoice>(
    prefillAgency ?? (brandMode === 'anderson' ? 'Anderson Collaborative' : 'Nativz'),
  );
  const [step, setStep] = useState<Step>('idle');
  const [detection, setDetection] = useState<DetectionResponse | null>(null);
  const [rows, setRows] = useState<Record<ConfirmRowPlatform, RowState>>({
    tiktok: emptyRow(),
    instagram: emptyRow(),
    youtube: emptyRow(),
    facebook: emptyRow(),
  });
  const [brandName, setBrandName] = useState(prefillName);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [primary, setPrimary] = useState<ConfirmRowPlatform | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleDetect = useCallback(async () => {
    setStep('detecting');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/prospects/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), agency }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as DetectionResponse;

      // Existed? Skip the confirm step and go straight to the record.
      if (data.existed) {
        toast.info('Prospect already exists. Opening the existing record.');
        router.replace(`/admin/prospects/${data.prospect.id}`);
        return;
      }

      setDetection(data);
      setBrandName(data.detection.brand_name);
      setWebsiteUrl(data.detection.website_url ?? '');

      const next: Record<ConfirmRowPlatform, RowState> = {
        tiktok: emptyRow(),
        instagram: emptyRow(),
        youtube: emptyRow(),
        facebook: emptyRow(),
      };
      for (const s of data.detection.socials) {
        next[s.platform] = {
          detection: {
            handle: s.handle,
            profile_url: s.profile_url,
            confidence: s.confidence,
            candidates: s.candidates,
          },
          included: true,
          manualOverride: null,
        };
      }
      setRows(next);
      // PRD D-07 primary order.
      const detected = ['tiktok', 'instagram', 'youtube', 'facebook'] as const;
      const primaryGuess = detected.find((p) => next[p].included && next[p].detection.handle);
      setPrimary(
        primaryGuess ?? data.detection.platform_seed ?? null,
      );
      setStep('confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setErrorMessage(message);
      setStep('error');
    }
  }, [router, url, agency]);

  const handleSave = useCallback(async () => {
    if (!detection) return;
    setSubmitting(true);
    try {
      const payloadSocials = PLATFORMS.flatMap((p) => {
        const r = rows[p];
        if (!r.included) return [];
        const handle = (r.manualOverride?.handle ?? r.detection.handle ?? '').trim();
        if (!handle) return [];
        const profile_url = r.manualOverride?.profile_url ?? r.detection.profile_url ?? null;
        return [{ platform: p, handle, profile_url, display_name: null }];
      });
      const primaryRow = primary ? rows[primary] : null;
      const primaryHandle = primaryRow
        ? primaryRow.manualOverride?.handle ?? primaryRow.detection.handle ?? null
        : null;

      const res = await fetch(`/api/prospects/${detection.prospect.id}/confirm-socials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_platform: primary,
          primary_handle: primaryHandle,
          socials: payloadSocials,
          trigger_analysis: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Update brand name + website if user edited.
      if (brandName.trim() !== detection.detection.brand_name || websiteUrl.trim() !== (detection.detection.website_url ?? '')) {
        await fetch(`/api/prospects/${detection.prospect.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_name: brandName.trim(), website_url: websiteUrl.trim() || null }),
        }).catch(() => {
          // Non-fatal — the prospect is already saved.
        });
      }
      toast.success('Prospect saved. Initial analysis running, check back in about a minute.');
      setStep('done');
      setTimeout(() => router.replace(`/admin/prospects/${detection.prospect.id}`), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setErrorMessage(message);
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  }, [brandName, detection, primary, rows, router, websiteUrl]);

  const saveBare = useCallback(() => {
    // The prospect row was already inserted before the error. Bounce to it.
    if (detection?.prospect.id) router.replace(`/admin/prospects/${detection.prospect.id}`);
  }, [detection, router]);

  const includedCount = useMemo(
    () => PLATFORMS.filter((p) => rows[p].included && (rows[p].manualOverride?.handle || rows[p].detection.handle)).length,
    [rows],
  );

  return (
    <div className="flex flex-col gap-4">
      {step === 'idle' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void handleDetect();
          }}
          className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
        >
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">Agency</p>
            <div
              role="radiogroup"
              aria-label="Agency"
              className="inline-flex w-full rounded-md border border-border bg-background p-1"
            >
              {(['Nativz', 'Anderson Collaborative'] as const).map((value) => {
                const selected = agency === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAgency(value)}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-muted hover:text-foreground'
                    }`}
                  >
                    {value === 'Anderson Collaborative' ? 'Anderson' : value}
                  </button>
                );
              })}
            </div>
          </div>
          <label htmlFor="seed-url" className="text-sm font-medium text-foreground">
            Paste a website or social profile URL
          </label>
          <div className="flex gap-2">
            <input
              id="seed-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://brand.com or https://www.tiktok.com/@brand"
              className="h-12 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={!url.trim()}
              className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Go
            </button>
          </div>
        </form>
      )}

      {step === 'detecting' && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-8 text-center">
          <Loader2 size={20} className="animate-spin text-accent" />
          <div className="text-sm text-text-primary">Scanning website and resolving handles</div>
          <div className="text-[11px] text-text-muted">This usually takes 10 to 20 seconds.</div>
        </div>
      )}

      {step === 'confirm' && detection && (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            {detection.detection.favicon_url ? (
              <Image
                src={detection.detection.favicon_url}
                alt=""
                width={36}
                height={36}
                className="rounded-md bg-background"
                unoptimized
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-text-muted">
                <Globe size={16} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-base font-semibold text-foreground focus:border-border focus:outline-none"
              />
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://brand.com"
                className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-text-muted focus:border-border focus:outline-none"
              />
            </div>
          </div>

          {detection.detection.detection_failed && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Auto-detect couldn&apos;t reach the site.</div>
                <div className="text-amber-200/80">
                  {detection.detection.detection_message ?? 'Add socials manually below or save bare.'}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {PLATFORMS.map((p) => (
              <PlatformConfirmRow
                key={p}
                platform={p}
                detection={rows[p].detection}
                included={rows[p].included}
                manualOverride={rows[p].manualOverride}
                isPrimary={primary === p}
                onToggle={(included) =>
                  setRows((r) => ({ ...r, [p]: { ...r[p], included } }))
                }
                onPickCandidate={(c) =>
                  setRows((r) => ({
                    ...r,
                    [p]: { ...r[p], manualOverride: c, included: true },
                  }))
                }
                onManualOverride={(v) =>
                  setRows((r) => ({
                    ...r,
                    [p]: { ...r[p], manualOverride: v, included: v ? true : r[p].included },
                  }))
                }
                onSetPrimary={() => setPrimary(p)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-text-muted">
              {includedCount} {includedCount === 1 ? 'platform' : 'platforms'} included
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/admin/prospects')}
                disabled={submitting}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Save prospect
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8 text-center">
          <div className="text-base font-semibold text-foreground">Prospect saved</div>
          <div className="text-sm text-text-muted">Running initial analysis…</div>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col gap-3 rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
            <div>
              <div className="font-medium text-red-100">Something went wrong</div>
              <div className="text-red-200/80">{errorMessage ?? 'Unknown error'}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surface"
            >
              Try again
            </button>
            {detection?.prospect.id && (
              <button
                type="button"
                onClick={saveBare}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surface"
              >
                Save bare prospect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
