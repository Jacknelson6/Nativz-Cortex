'use client';

/**
 * Brand basics screen.
 *
 * Lightweight: website URL, logo upload, voice (optional), current offers
 * (optional). Strategists capture the deeper brand details out-of-band so
 * the client form is short. All five fields are mirrored back to the
 * `clients` row on submit via syncBrandBasicsToClient.
 */

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Loader2, Upload, X, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

interface BrandBasicsValue {
  tagline?: string;
  what_we_sell?: string;
  audience?: string;
  voice?: string;
  current_offers?: string;
  website_url?: string;
  logo_url?: string;
}

export interface BrandBasicsPrefill {
  tagline: string | null;
  what_we_sell: string | null;
  audience: string | null;
  voice: string | null;
  current_offers: string | null;
  website_url: string | null;
  logo_url: string | null;
}

interface Props {
  value: Record<string, unknown> | null;
  clientName: string;
  /**
   * Latest fields from the `clients` row. Used as the initial form value
   * when step_state has nothing yet, so the client only fills in gaps.
   */
  prefill: BrandBasicsPrefill | null;
  /** Onboarding share token; used by the public logo upload endpoint. */
  token: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

function pick(stepValue: unknown, prefillValue: unknown): string {
  if (typeof stepValue === 'string' && stepValue.trim().length > 0) return stepValue;
  if (typeof prefillValue === 'string') return prefillValue;
  return '';
}

export function BrandBasicsScreen({
  value,
  clientName,
  prefill,
  token,
  submitting,
  onSubmit,
}: Props) {
  const initial = (value as BrandBasicsValue | null) ?? {};
  const [websiteUrl, setWebsiteUrl] = useState(pick(initial.website_url, prefill?.website_url));
  const [logoUrl, setLogoUrl] = useState(pick(initial.logo_url, prefill?.logo_url));
  const [voice, setVoice] = useState(pick(initial.voice, prefill?.voice));
  const [currentOffers, setCurrentOffers] = useState(
    pick(initial.current_offers, prefill?.current_offers),
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canSubmit = !submitting && !uploading;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/public/onboarding/${token}/logo`, {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setUploadError(j.error ?? 'Could not upload logo.');
        return;
      }
      setLogoUrl(j.url);
    } catch {
      setUploadError('Network error. Try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          // Preserve any pre-existing brand fields the strategist already
          // captured; we no longer surface tagline/what_we_sell/audience
          // in the form, but still want them round-tripped if present.
          tagline: (initial.tagline ?? '').trim(),
          what_we_sell: (initial.what_we_sell ?? '').trim(),
          audience: (initial.audience ?? '').trim(),
          voice: voice.trim(),
          current_offers: currentOffers.trim(),
          website_url: websiteUrl.trim(),
          logo_url: logoUrl.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Brand basics
        </h1>
        <p className="text-base text-text-secondary">
          A couple of quick essentials so we can brand {clientName} correctly. All optional.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label
            htmlFor="website_url"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Website URL
          </label>
          <div className="relative">
            <Globe
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <Input
              id="website_url"
              type="url"
              inputMode="url"
              placeholder="https://yourbrand.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              maxLength={300}
              disabled={submitting}
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Logo
          </label>
          <div className="rounded-xl border border-dashed border-nativz-border bg-surface-hover/40 px-4 py-4">
            {logoUrl ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-nativz-border bg-background">
                    <Image
                      src={logoUrl}
                      alt={`${clientName} logo`}
                      width={56}
                      height={56}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 text-sm text-text-secondary truncate">Logo uploaded</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || submitting}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Replace
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoUrl('')}
                    disabled={uploading || submitting}
                  >
                    <X size={14} />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || submitting}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-hover/60 disabled:opacity-60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {uploading ? 'Uploading...' : 'Upload your logo'}
                  </div>
                  <div className="text-xs text-text-muted">PNG, JPG, or WebP up to 2 MB.</div>
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={handleFileChange}
            />
          </div>
          {uploadError && (
            <p className="mt-1.5 text-xs text-status-error">{uploadError}</p>
          )}
        </div>

        <Textarea
          id="voice"
          label="How should the brand sound? (optional)"
          placeholder="Three words, or a sentence. e.g. confident, dry, anti-corporate."
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          rows={2}
          maxLength={300}
          disabled={submitting}
        />

        <Textarea
          id="current_offers"
          label="Current offers or promotions (optional)"
          placeholder="Anything we should be highlighting right now? Sales, launches, new products, lead magnets."
          value={currentOffers}
          onChange={(e) => setCurrentOffers(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
