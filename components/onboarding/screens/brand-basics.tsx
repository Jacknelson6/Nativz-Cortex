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
import { Loader2, Upload, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { ClientLogo } from '@/components/clients/client-logo';

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
  onBack?: () => void;
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
  onBack,
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

        <div className="flex flex-col items-center gap-3 py-2">
          <label className="block text-sm font-medium text-text-secondary">
            Logo
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || submitting}
            className="group relative shrink-0 rounded-full transition hover:ring-2 hover:ring-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            aria-label={logoUrl ? 'Replace logo' : 'Upload logo'}
          >
            <ClientLogo src={logoUrl || null} name={clientName} size="xl" />
            <div
              className={
                'absolute inset-0 flex items-center justify-center rounded-full bg-black/45 transition-opacity ' +
                (logoUrl ? 'opacity-0 group-hover:opacity-100' : 'opacity-100')
              }
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin text-white" />
              ) : (
                <Upload size={20} className="text-white" />
              )}
            </div>
          </button>
          <p className="text-xs text-text-muted text-center">
            {uploading
              ? 'Uploading...'
              : logoUrl
                ? 'Click to replace.'
                : 'Click to upload. PNG, JPG, or WebP up to 2 MB.'}
          </p>
          {logoUrl && !uploading ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setLogoUrl('')}
              disabled={submitting}
            >
              Remove
            </Button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={handleFileChange}
          />
          {uploadError && (
            <p className="text-xs text-status-error text-center">{uploadError}</p>
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={submitting || uploading}
            className="self-start sm:self-auto"
          >
            Back
          </Button>
        ) : (
          <div />
        )}
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
