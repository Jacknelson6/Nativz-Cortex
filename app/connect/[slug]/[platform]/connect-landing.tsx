'use client';

import { useState } from 'react';
import { Facebook, Instagram, Loader2, Music2, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';

type SupportedPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

const PLATFORM_ICON: Record<SupportedPlatform, typeof Music2> = {
  tiktok: Music2,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
};

interface Props {
  slug: string;
  platform: SupportedPlatform;
  platformLabel: string;
  clientName: string;
  clientLogoUrl: string | null;
}

/**
 * Single-CTA landing. We deliberately don't show a tracker timeline,
 * legal copy, or anything else: every extra word is a chance for the
 * client to bounce. Tap, OAuth, done.
 */
export function ConnectLanding({
  slug,
  platform,
  platformLabel,
  clientName,
  clientLogoUrl,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = PLATFORM_ICON[platform];

  async function handleConnect() {
    setSubmitting(true);
    setError(null);
    let redirected = false;
    try {
      const res = await fetch(
        `/api/public/clients/${slug}/connect/${platform}`,
        { method: 'POST' },
      );
      const data = (await res.json()) as { authUrl?: string; error?: string };
      if (!res.ok || !data.authUrl) {
        throw new Error(data.error ?? 'Failed to start connection');
      }
      redirected = true;
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      // Keep the spinner pinned during the redirect to authUrl so the
      // button doesn't flash back to "Connect" while the browser is
      // already navigating away.
      if (!redirected) setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full flex-col items-center rounded-2xl border border-nativz-border bg-surface p-8 text-center shadow-lg">
        <ClientLogo name={clientName} src={clientLogoUrl} size="lg" />

        <h1 className="mt-5 text-xl font-semibold text-text-primary">
          Connect {clientName}&apos;s {platformLabel}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Tap below to log in to {platformLabel}. We use this access to
          publish posts your team approves. You can revoke it anytime.
        </p>

        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => void handleConnect()}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Icon className="size-4" />
          )}
          <span>
            {submitting ? 'Opening login...' : `Connect ${platformLabel}`}
          </span>
        </Button>

        {error && (
          <p className="mt-3 text-xs text-status-danger">{error}</p>
        )}

        <p className="mt-6 text-[11px] text-text-tertiary">
          Powered by Nativz Cortex
        </p>
      </div>
    </main>
  );
}
