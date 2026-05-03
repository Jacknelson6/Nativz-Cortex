'use client';

/**
 * Social connect screen.
 *
 * For each platform the client selected up front (lives on
 * `onboarding.platforms`), capture their handle and a public URL we can
 * reference. The actual OAuth round-trip is a separate flow run by the
 * connection-invite system; this screen is the lightweight "tell us
 * who you are on each platform" step so the strategist can audit
 * before we ask for OAuth.
 *
 * If platforms is empty we skip straight through with an empty payload.
 */

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

interface SocialHandlesValue {
  handles?: Record<string, { handle: string; url: string }>;
}

interface Props {
  value: Record<string, unknown> | null;
  platforms: string[];
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

export function SocialConnectScreen({ value, platforms, submitting, onSubmit }: Props) {
  const initial = (value as SocialHandlesValue | null) ?? {};
  const initialHandles = initial.handles ?? {};

  const [handles, setHandles] = useState<Record<string, { handle: string; url: string }>>(() => {
    const seed: Record<string, { handle: string; url: string }> = {};
    for (const p of platforms) {
      seed[p] = {
        handle: initialHandles[p]?.handle ?? '',
        url: initialHandles[p]?.url ?? '',
      };
    }
    return seed;
  });

  const hasAny = useMemo(
    () => Object.values(handles).some((h) => h.handle.trim().length > 0),
    [handles],
  );

  function update(platform: string, field: 'handle' | 'url', v: string) {
    setHandles((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: v },
    }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (submitting) return;
        const cleaned: Record<string, { handle: string; url: string }> = {};
        for (const [k, v] of Object.entries(handles)) {
          cleaned[k] = { handle: v.handle.trim(), url: v.url.trim() };
        }
        onSubmit({ handles: cleaned });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">Your accounts</h1>
        <p className="text-base text-text-secondary">
          Tell us where you live online. The handle is enough; the URL helps us audit faster.
        </p>
      </div>

      {platforms.length === 0 ? (
        <div className="rounded-lg border border-nativz-border bg-surface px-4 py-6 text-sm text-text-secondary">
          No platforms selected for this engagement. You can skip ahead.
        </div>
      ) : (
        <div className="space-y-5">
          {platforms.map((p) => {
            const label = PLATFORM_LABEL[p] ?? p;
            return (
              <div key={p} className="space-y-3 rounded-lg border border-nativz-border bg-surface px-4 py-4">
                <div className="text-sm font-medium text-text-primary">{label}</div>
                <Input
                  id={`${p}-handle`}
                  label="Handle"
                  placeholder="@yourbrand"
                  value={handles[p]?.handle ?? ''}
                  onChange={(e) => update(p, 'handle', e.target.value)}
                  disabled={submitting}
                />
                <Input
                  id={`${p}-url`}
                  label="Profile URL (optional)"
                  placeholder={`https://${p === 'tiktok' ? 'tiktok.com/@yourbrand' : 'example.com/yourbrand'}`}
                  value={handles[p]?.url ?? ''}
                  onChange={(e) => update(p, 'url', e.target.value)}
                  disabled={submitting}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          {hasAny ? "We'll send a separate link to actually connect each account when you're ready." : "You can fill this in later."}
        </p>
        <Button type="submit" size="lg" disabled={submitting}>
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
