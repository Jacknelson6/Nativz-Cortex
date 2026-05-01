'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  CircleAlert,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Twitter,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ClientLogo } from '@/components/clients/client-logo';
import type { AgencyBrand } from '@/lib/agency/detect';

const ZERNIO_PLATFORMS = new Set(['tiktok', 'instagram', 'facebook', 'youtube']);

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

const PLATFORM_ICON: Record<string, typeof Music2> = {
  tiktok: Music2,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  googlebusiness: Globe,
  pinterest: Globe,
  x: Twitter,
  threads: Globe,
  bluesky: Globe,
};

interface PlatformStatus {
  key: string;
  label: string;
  status: 'connected' | 'pending';
  username: string | null;
}

interface InviteResponse {
  brandName: string;
  brandSlug: string | null;
  brand: AgencyBrand;
  expired: boolean;
  completedAt: string | null;
  platforms: PlatformStatus[];
}

interface Props {
  token: string;
  brand: AgencyBrand;
  brandName: string;
  brandLogoUrl: string | null;
  platforms: string[];
  completedAt: string | null;
  expired: boolean;
}

type PendingConfirm =
  | { kind: 'connect'; platform: string }
  | { kind: 'disconnect'; platform: string }
  | null;

/**
 * Public invite landing. Polls the public invite endpoint on mount + after
 * `?ok=1` returns from the OAuth round-trip, so the just-connected platform
 * flips to a green check without a manual refresh.
 *
 * Confirmation gate: every "Connect" click opens a modal that asks the
 * client to verify they're logged into the *brand's* account on the platform
 * they're about to link. This is the cheapest defense against clients
 * accidentally linking their personal IG / TikTok and feeding us posts to
 * their personal feed. Pair: the "Remove" button on connected rows lets
 * them undo a wrong account without going through the team.
 */
export function InviteLanding({
  token,
  brandName,
  brandLogoUrl,
  platforms: askedFor,
  completedAt: initialCompletedAt,
  expired,
}: Props) {
  const initialPlatforms: PlatformStatus[] = askedFor.map((key) => ({
    key,
    label: PLATFORM_LABEL[key] ?? key,
    status: 'pending',
    username: null,
  }));

  const [platforms, setPlatforms] = useState<PlatformStatus[]>(initialPlatforms);
  const [completedAt, setCompletedAt] = useState<string | null>(initialCompletedAt);
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null);
  const [removingPlatform, setRemovingPlatform] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/public/connection-invites/${token}`);
      if (!res.ok) return;
      const data = (await res.json()) as InviteResponse;
      setPlatforms(data.platforms);
      setCompletedAt(data.completedAt);
    } catch {
      // Silent: caller surfaces its own error if needed.
    }
  }

  useEffect(() => {
    if (expired) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/connection-invites/${token}`);
        if (!res.ok) return;
        const data = (await res.json()) as InviteResponse;
        if (cancelled) return;
        setPlatforms(data.platforms);
        setCompletedAt(data.completedAt);
      } catch {
        // Silent: initial paint already shows the asked-for list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, expired]);

  async function startConnect(platform: string) {
    setPendingPlatform(platform);
    setError(null);
    let redirected = false;
    try {
      const res = await fetch(
        `/api/public/connection-invites/${token}/connect/${platform}`,
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
      if (!redirected) setPendingPlatform(null);
    }
  }

  async function startDisconnect(platform: string) {
    setRemovingPlatform(platform);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/connection-invites/${token}/disconnect/${platform}`,
        { method: 'DELETE' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to remove connection');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setRemovingPlatform(null);
    }
  }

  function handleConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'connect') void startConnect(c.platform);
    else void startDisconnect(c.platform);
  }

  if (expired) {
    return (
      <Shell brandName={brandName} brandLogoUrl={brandLogoUrl}>
        <div className="flex flex-col items-center text-center">
          <CircleAlert className="size-6 text-status-warning" />
          <h1 className="mt-3 text-lg font-semibold text-text-primary">
            This invite has expired.
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Reach out to your team and ask for a fresh link.
          </p>
        </div>
      </Shell>
    );
  }

  const allDone = !!completedAt;
  const confirmPlatformLabel = confirm
    ? PLATFORM_LABEL[confirm.platform] ?? confirm.platform
    : '';

  return (
    <Shell brandName={brandName} brandLogoUrl={brandLogoUrl}>
      {allDone ? (
        <div className="flex flex-col items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-status-success/15 text-status-success">
            <Check className="size-5" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-text-primary">
            All set, thanks!
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            We&apos;ve got everything we need on our side. You can close this
            tab.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-text-primary">
            Reconnect {brandName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Tap each platform below to log back in. Each one takes a few
            seconds and we&apos;ll handle the rest.
          </p>
        </>
      )}

      <ul className="mt-6 flex w-full flex-col gap-3">
        {platforms.map((p) => (
          <PlatformRow
            key={p.key}
            platform={p}
            connecting={pendingPlatform === p.key}
            removing={removingPlatform === p.key}
            onConnect={() => setConfirm({ kind: 'connect', platform: p.key })}
            onRemove={() => setConfirm({ kind: 'disconnect', platform: p.key })}
          />
        ))}
      </ul>

      {error && (
        <p className="mt-3 text-xs text-status-danger">{error}</p>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'connect'}
        variant="default"
        title={`Connecting ${confirmPlatformLabel}`}
        description={`This will take you to ${confirmPlatformLabel} to log in. Make sure you're already signed in to the ${brandName} ${confirmPlatformLabel} account in this browser, not your personal one. Whichever account is logged in is the one we'll connect.`}
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'disconnect'}
        variant="danger"
        title={`Remove ${confirmPlatformLabel}?`}
        description={`We'll disconnect ${confirmPlatformLabel} from ${brandName} and you can connect it again with the right account. Posts already scheduled to this account will fail to publish until you reconnect.`}
        confirmLabel="Remove"
        cancelLabel="Keep connected"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </Shell>
  );
}

function PlatformRow({
  platform,
  connecting,
  removing,
  onConnect,
  onRemove,
}: {
  platform: PlatformStatus;
  connecting: boolean;
  removing: boolean;
  onConnect: () => void;
  onRemove: () => void;
}) {
  const Icon = PLATFORM_ICON[platform.key] ?? Globe;
  const isZernio = ZERNIO_PLATFORMS.has(platform.key);
  const isConnected = platform.status === 'connected';

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">
            {platform.label}
          </div>
          {isConnected && platform.username && (
            <div className="truncate text-xs text-text-muted">
              @{platform.username}
            </div>
          )}
          {!isZernio && !isConnected && (
            <div className="truncate text-xs text-text-muted">
              Manual setup, ping the team.
            </div>
          )}
        </div>
      </div>

      {isConnected ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-status-success">
            <Check className="size-3.5" />
            Connected
          </span>
          {isZernio && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={removing}
              className="h-7 px-2 text-xs text-text-muted hover:text-status-danger"
            >
              {removing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                'Remove'
              )}
            </Button>
          )}
        </div>
      ) : isZernio ? (
        <Button
          size="sm"
          onClick={onConnect}
          disabled={connecting}
          className="shrink-0"
        >
          {connecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          {connecting ? 'Opening...' : 'Connect'}
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-text-tertiary">Manual</span>
      )}
    </li>
  );
}

function Shell({
  brandName,
  brandLogoUrl,
  children,
}: {
  brandName: string;
  brandLogoUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full flex-col rounded-2xl border border-nativz-border bg-surface p-8 shadow-lg">
        <div className="mb-5 flex justify-center">
          <ClientLogo name={brandName} src={brandLogoUrl} size="lg" />
        </div>
        {children}
        <p className="mt-6 text-center text-[11px] text-text-tertiary">
          Powered by Nativz Cortex
        </p>
      </div>
    </main>
  );
}
