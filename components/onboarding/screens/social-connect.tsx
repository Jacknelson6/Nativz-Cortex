'use client';

/**
 * Social connect screen.
 *
 * For each platform, the client either connects now (Zernio OAuth in a
 * popup) or clicks "Don't have one", which opens a modal asking whether
 * we should set it up for them or skip the platform entirely.
 *
 * The Meta Business Suite tile is a separate access-grant ask: the
 * client adds the agency's Partner ID to Business Manager (with a
 * linked guide), or emails ops the request, then ticks the self-attest
 * checkbox.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, ExternalLink, Mail, Copy, ShieldCheck, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { AgencyTheme } from '@/lib/branding';
import type {
  SocialHandlesState,
  SocialPlatformConnection,
} from '@/lib/onboarding/types';

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

const META_PARTNER_GUIDE_URL =
  'https://www.facebook.com/business/help/2169003770027706';

interface Props {
  value: Record<string, unknown> | null;
  platforms: string[];
  agency: AgencyTheme;
  token: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
  onBack?: () => void;
}

type Status = SocialPlatformConnection['status'];

export function SocialConnectScreen({
  value,
  platforms,
  agency,
  token,
  submitting,
  onSubmit,
  onBack,
}: Props) {
  const initial = (value as SocialHandlesState | null) ?? {};
  const initialConnections = initial.connections ?? {};

  const [connections, setConnections] = useState<Record<string, SocialPlatformConnection>>(() => {
    const seed: Record<string, SocialPlatformConnection> = {};
    for (const p of platforms) {
      seed[p] = initialConnections[p] ?? { status: 'pending' };
    }
    return seed;
  });
  const [metaAck, setMetaAck] = useState<boolean>(
    initial.meta_business_suite_acknowledged ?? false,
  );
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [dontHavePlatform, setDontHavePlatform] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Poll the live row while a Zernio popup is open so the row flips to
  // 'connected' as soon as the webhook lands without forcing a refresh.
  useEffect(() => {
    if (!busyPlatform) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/onboarding/${token}`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as { step_state?: { social_handles?: SocialHandlesState } };
        const liveConnections = j.step_state?.social_handles?.connections ?? {};
        const live = liveConnections[busyPlatform];
        if (live && live.status === 'connected') {
          setConnections((prev) => ({ ...prev, [busyPlatform]: live }));
          setBusyPlatform(null);
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearInterval(t);
  }, [busyPlatform, token]);

  function setStatus(platform: string, status: Status, extra?: Partial<SocialPlatformConnection>) {
    setConnections((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], status, ...extra },
    }));
  }

  async function handleConnect(platform: string) {
    setBusyPlatform(platform);
    try {
      const res = await fetch(`/api/public/onboarding/${token}/connect-invite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      if (!res.ok) {
        setBusyPlatform(null);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const popup = window.open(url, 'connect', 'width=520,height=720');
      popupRef.current = popup;
      if (!popup) setBusyPlatform(null);
    } catch {
      setBusyPlatform(null);
    }
  }

  function openDontHave(platform: string) {
    setDontHavePlatform(platform);
  }

  function closeDontHave() {
    setDontHavePlatform(null);
    setSetupBusy(false);
  }

  async function submitSetUpForMe() {
    if (!dontHavePlatform) return;
    setSetupBusy(true);
    try {
      const res = await fetch(`/api/public/onboarding/${token}/set-up-for-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: dontHavePlatform,
          note: null,
        }),
      });
      if (res.ok) {
        setStatus(dontHavePlatform, 'set_up_for_me');
        closeDontHave();
      }
    } catch {
      // ignore
    } finally {
      setSetupBusy(false);
    }
  }

  function confirmSkip() {
    if (!dontHavePlatform) return;
    setStatus(dontHavePlatform, 'skipped');
    closeDontHave();
  }

  const allDecided = platforms.every(
    (p) => connections[p]?.status && connections[p].status !== 'pending',
  );
  const canContinue = (platforms.length === 0 || allDecided) && !submitting;

  function statusBadge(
    status: Status | undefined,
  ): { label: string; tone: 'good' | 'muted' | 'warn' } | null {
    if (!status || status === 'pending') return null;
    if (status === 'connected') return { label: 'Connected', tone: 'good' };
    if (status === 'set_up_for_me') return { label: 'We’ll set it up', tone: 'warn' };
    if (status === 'skipped') return { label: 'Skipped for now', tone: 'muted' };
    if (status === 'manual') return { label: 'Handed off', tone: 'warn' };
    return null;
  }

  const supportEmail = agency.opsEmail ?? agency.supportEmail;
  const metaPartnerId = agency.metaBusinessId?.trim() ?? '';
  const dontHaveLabel = dontHavePlatform ? PLATFORM_LABEL[dontHavePlatform] ?? dontHavePlatform : '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canContinue) return;
        onSubmit({
          connections,
          meta_business_suite_acknowledged: metaAck,
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Connect your accounts
        </h1>
        <p className="text-base text-text-secondary">
          For each platform, connect now or tap “Don’t have one” to either hand setup to us or skip
          the platform.
        </p>
      </div>

      {platforms.length === 0 ? (
        <div className="rounded-lg border border-nativz-border bg-surface px-4 py-6 text-sm text-text-secondary">
          No platforms picked yet. Reach out to {supportEmail} and we’ll add them.
        </div>
      ) : (
        <div className="space-y-4">
          {platforms.map((p) => {
            const label = PLATFORM_LABEL[p] ?? p;
            const conn = connections[p];
            const badge = statusBadge(conn?.status);
            const isBusy = busyPlatform === p;
            const decided = conn?.status && conn.status !== 'pending';

            return (
              <div
                key={p}
                className="space-y-3 rounded-lg border border-nativz-border bg-surface px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary">{label}</div>
                    {conn?.handle && (
                      <div className="text-xs text-text-muted">{conn.handle}</div>
                    )}
                  </div>
                  {badge && (
                    <span
                      className={
                        badge.tone === 'good'
                          ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-status-success/15 px-2 py-0.5 text-xs font-medium text-status-success'
                          : badge.tone === 'warn'
                            ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-text'
                            : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted'
                      }
                    >
                      {badge.tone === 'good' && <Check size={12} />}
                      {badge.label}
                    </span>
                  )}
                </div>

                {!decided && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConnect(p)}
                      disabled={isBusy || submitting}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Waiting on {label}...
                        </>
                      ) : (
                        <>
                          <ExternalLink size={14} />
                          Connect {label}
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openDontHave(p)}
                      disabled={submitting}
                    >
                      Don’t have one
                    </Button>
                  </div>
                )}

                {conn?.status === 'set_up_for_me' && (
                  <p className="text-xs text-text-muted">
                    {agency.shortName} team will complete this for you.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MetaBusinessSuiteTile
        partnerId={metaPartnerId}
        opsEmail={supportEmail}
        agencyShortName={agency.shortName}
        acknowledged={metaAck}
        onChange={setMetaAck}
        disabled={submitting}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={submitting}
            >
              Back
            </Button>
          ) : null}
          <p className="text-xs text-text-muted">
            You can change any of these later from the same link.
          </p>
        </div>
        <Button type="submit" size="lg" disabled={!canContinue} className="w-full sm:w-auto">
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

      <Dialog
        open={dontHavePlatform !== null}
        onClose={closeDontHave}
        title={dontHaveLabel ? `${dontHaveLabel}: pick a path` : 'Pick a path'}
        maxWidth="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            No problem. Choose how you’d like to handle {dontHaveLabel}.
          </p>
          <button
            type="button"
            onClick={submitSetUpForMe}
            disabled={setupBusy}
            className="w-full rounded-lg border border-nativz-border bg-surface px-4 py-3 text-left transition hover:border-accent hover:bg-surface-hover disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-text-primary">Set it up for me</div>
              {setupBusy && <Loader2 size={14} className="animate-spin text-text-muted" />}
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {agency.shortName} will reach out and walk you through creating the account and
              getting access.
            </p>
          </button>
          <button
            type="button"
            onClick={confirmSkip}
            disabled={setupBusy}
            className="w-full rounded-lg border border-nativz-border bg-surface px-4 py-3 text-left transition hover:border-accent hover:bg-surface-hover disabled:opacity-60"
          >
            <div className="text-sm font-medium text-text-primary">Skip this platform</div>
            <p className="mt-1 text-xs text-text-secondary">
              We’ll leave {dontHaveLabel} out of the rotation. You can revisit this from the same
              link later.
            </p>
          </button>
        </div>
      </Dialog>
    </form>
  );
}

function MetaBusinessSuiteTile(props: {
  partnerId: string;
  opsEmail: string;
  agencyShortName: string;
  acknowledged: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPartnerId() {
    try {
      await navigator.clipboard.writeText(props.partnerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-start gap-3 border-b border-nativz-border bg-background/40 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-text">
          <ShieldCheck size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">Meta Business Suite access</div>
          <p className="mt-0.5 text-xs text-text-secondary">
            So we can run ads and pull insights for Facebook + Instagram, add{' '}
            {props.agencyShortName} as a partner inside Business Manager.
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {props.partnerId ? (
          <>
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Partner ID
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface-hover px-2.5 py-1.5 font-mono text-sm text-text-primary">
                  {props.partnerId}
                </code>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={copyPartnerId}
                  disabled={props.disabled}
                >
                  {copied ? (
                    <>
                      <Check size={12} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>
            </div>

            <ol className="space-y-2 text-xs text-text-secondary">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium text-text-primary">
                  1
                </span>
                <span>
                  Open Meta Business Suite &rarr; Settings &rarr; Business assets &rarr; Partners.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium text-text-primary">
                  2
                </span>
                <span>Click “Add partner” and paste the Partner ID above.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium text-text-primary">
                  3
                </span>
                <span>Grant access to your Pages, Instagram accounts, and Ad accounts.</span>
              </li>
            </ol>

            <div className="flex flex-wrap gap-2">
              <a
                href={META_PARTNER_GUIDE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent-text"
              >
                <BookOpen size={12} />
                Read Meta’s guide
                <ExternalLink size={11} className="opacity-60" />
              </a>
              <a
                href={`mailto:${props.opsEmail}?subject=Meta%20Business%20Suite%20access`}
                className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent-text"
              >
                <Mail size={12} />
                Email {props.agencyShortName} for help
              </a>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-text-secondary">
              Email{' '}
              <a href={`mailto:${props.opsEmail}`} className="text-accent-text underline">
                {props.opsEmail}
              </a>{' '}
              and we’ll send Business Manager invite details for your team to action.
            </p>
            <a
              href={`mailto:${props.opsEmail}?subject=Meta%20Business%20Suite%20access`}
              className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent-text"
            >
              <Mail size={12} />
              Email {props.agencyShortName}
            </a>
          </div>
        )}

        <label className="flex items-start gap-2 border-t border-nativz-border pt-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={props.acknowledged}
            onChange={(e) => props.onChange(e.target.checked)}
            disabled={props.disabled}
            className="mt-0.5"
          />
          <span>I’ve granted access (or sent a teammate to handle it).</span>
        </label>
      </div>
    </div>
  );
}
