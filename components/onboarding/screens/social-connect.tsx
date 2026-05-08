'use client';

/**
 * Social connect screen.
 *
 * For each platform on the engagement, the client picks one of three
 * paths: connect now (Zernio OAuth in a popup), set-up-for-me (we ping
 * ops and they walk them through it), or skip. The Meta Business Suite
 * tile is a separate access-grant ask: either the client adds our
 * Partner ID to Business Manager, or they email a teammate the share
 * link, then ticks the self-attest checkbox.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, ExternalLink, Mail, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
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

interface Props {
  value: Record<string, unknown> | null;
  platforms: string[];
  agency: AgencyTheme;
  token: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

type Status = SocialPlatformConnection['status'];

export function SocialConnectScreen({
  value,
  platforms,
  agency,
  token,
  submitting,
  onSubmit,
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
  const [setupPlatform, setSetupPlatform] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState('');
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

  async function handleSetUpForMe(platform: string) {
    try {
      const res = await fetch(`/api/public/onboarding/${token}/set-up-for-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, note: setupNote || null }),
      });
      if (res.ok) {
        setStatus(platform, 'set_up_for_me');
        setSetupPlatform(null);
        setSetupNote('');
      }
    } catch {
      // ignore
    }
  }

  function handleSkip(platform: string) {
    setStatus(platform, 'skipped');
  }

  const allDecided = platforms.every((p) => connections[p]?.status && connections[p].status !== 'pending');
  const canContinue = (platforms.length === 0 || allDecided) && !submitting;

  function statusBadge(status: Status | undefined): { label: string; tone: 'good' | 'muted' | 'warn' } | null {
    if (!status || status === 'pending') return null;
    if (status === 'connected') return { label: 'Connected', tone: 'good' };
    if (status === 'set_up_for_me') return { label: 'We’ll set it up', tone: 'warn' };
    if (status === 'skipped') return { label: 'Skipped for now', tone: 'muted' };
    if (status === 'manual') return { label: 'Handed off', tone: 'warn' };
    return null;
  }

  const supportEmail = agency.opsEmail ?? agency.supportEmail;
  const metaPartnerId = agency.metaBusinessId?.trim() ?? '';

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
          For each platform, choose how you want to hand it off. Connect now, ask us to set it up,
          or skip and come back later.
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
            const isSetup = setupPlatform === p;

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

                {!isSetup && conn?.status !== 'connected' && (
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
                      onClick={() => setSetupPlatform(p)}
                      disabled={submitting}
                    >
                      Set up for me
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSkip(p)}
                      disabled={submitting}
                    >
                      Skip
                    </Button>
                  </div>
                )}

                {isSetup && (
                  <div className="space-y-3 rounded-md border border-nativz-border bg-background p-3">
                    <p className="text-xs text-text-secondary">
                      We’ll reach out to walk you through giving us access. Add a note if there’s
                      anything we should know first.
                    </p>
                    <Textarea
                      id={`${p}-setup-note`}
                      label="Note (optional)"
                      placeholder="e.g. Manager Sara handles the account, loop her in."
                      value={setupNote}
                      onChange={(e) => setSetupNote(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      disabled={submitting}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSetUpForMe(p)}
                        disabled={submitting}
                      >
                        Send request
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSetupPlatform(null);
                          setSetupNote('');
                        }}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {conn?.status === 'skipped' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus(p, 'pending')}
                      disabled={submitting}
                    >
                      Undo skip
                    </Button>
                  </div>
                )}

                {conn?.status === 'set_up_for_me' && (
                  <p className="text-xs text-text-muted">
                    Heads-up sent. {agency.shortName} will reach out to wire it up.
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
        <p className="text-xs text-text-muted">
          You can change any of these later from the same link.
        </p>
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
    <div className="space-y-3 rounded-lg border border-nativz-border bg-surface px-4 py-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-text-primary">Meta Business Suite access</div>
        <p className="text-xs text-text-secondary">
          So we can run ads and pull insights for Facebook + Instagram, add{' '}
          {props.agencyShortName} as a partner inside Business Manager.
        </p>
      </div>

      {props.partnerId ? (
        <div className="space-y-2 rounded-md border border-nativz-border bg-background p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Partner ID
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface-hover px-2 py-1 text-sm text-text-primary">
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
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            In Business Manager: Settings &rarr; Partners &rarr; Add Partner &rarr; paste this ID.
            Grant access to your Pages and Ad Accounts.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-nativz-border bg-background p-3">
          <p className="text-xs text-text-secondary">
            Email <a href={`mailto:${props.opsEmail}`} className="text-accent-text underline">
              {props.opsEmail}
            </a>{' '}
            and we’ll send Business Manager invite details for your team to action.
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              window.location.href = `mailto:${props.opsEmail}?subject=Meta%20Business%20Suite%20access`;
            }}
            disabled={props.disabled}
          >
            <Mail size={12} />
            Email {props.agencyShortName}
          </Button>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-text-secondary">
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
  );
}
