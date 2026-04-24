'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users2, Sparkles, Link2, ExternalLink, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ClientLogo } from '@/components/clients/client-logo';

/**
 * ClientDossierHeader — the "first paint" strip at the top of the client
 * info page. Answers a single question at a glance: *"what's the state of
 * this client right now?"* without requiring the admin to scroll anything.
 *
 * Left block: logo + name + industry + website. Right block: three evidence
 * pills (linked socials, competitors tracked, brand DNA status). Read-only —
 * editing happens inside the section cards below.
 */

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

interface SocialSlot {
  platform: Platform;
  status: 'linked' | 'no_account' | 'unset';
  handle: string | null;
  zernio_connected: boolean;
}

interface Competitor {
  id: string;
}

export type BrandDnaStatus = 'none' | 'generating' | 'generated' | string;

export interface ClientDossierHeaderProps {
  clientId: string;
  clientSlug: string;
  name: string;
  industry: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  brandDnaStatus: BrandDnaStatus;
  brandDnaUpdatedAt: string | null;
  /** Deep-link target for the "Brand DNA" pill — usually the brand-profile page. */
  brandProfileHref?: string;
}

const PLATFORM_ORDER: Platform[] = ['instagram', 'tiktok', 'facebook', 'youtube'];

export function ClientDossierHeader({
  clientId,
  clientSlug,
  name,
  industry,
  websiteUrl,
  logoUrl,
  brandDnaStatus,
  brandDnaUpdatedAt,
  brandProfileHref,
}: ClientDossierHeaderProps) {
  const [socials, setSocials] = useState<SocialSlot[] | null>(null);
  const [competitorCount, setCompetitorCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/clients/${clientId}/social-slots`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/clients/${clientId}/competitors`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([slotsRes, compRes]) => {
      if (cancelled) return;
      setSocials((slotsRes?.slots as SocialSlot[]) ?? []);
      setCompetitorCount(((compRes?.competitors as Competitor[]) ?? []).length);
    }).catch(() => {
      if (cancelled) return;
      setSocials([]);
      setCompetitorCount(0);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  const abbreviation = name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const linkedSocials = socials?.filter((s) => s.status === 'linked') ?? [];

  return (
    <header className="rounded-xl border border-nativz-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0">
            <ClientLogo
              src={logoUrl}
              name={name}
              abbreviation={abbreviation}
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary leading-tight truncate">
              {name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {industry ? (
                <span className="text-text-secondary">{industry}</span>
              ) : (
                <span className="italic text-text-muted">No industry set</span>
              )}
              {websiteUrl && (
                <>
                  <span aria-hidden className="text-text-muted">·</span>
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent-text hover:underline"
                  >
                    {cleanDomain(websiteUrl)}
                    <ExternalLink size={10} aria-hidden />
                  </a>
                </>
              )}
              {clientSlug && (
                <>
                  <span aria-hidden className="text-text-muted">·</span>
                  <span className="font-mono text-text-muted">{clientSlug}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end lg:pl-4">
          <SocialsPill slots={socials} linked={linkedSocials.length} />
          <CompetitorsPill
            count={competitorCount}
            href={brandProfileHref}
          />
          <BrandDnaPill
            status={brandDnaStatus}
            updatedAt={brandDnaUpdatedAt}
            href={brandProfileHref}
          />
        </div>
      </div>
    </header>
  );
}

// ─── Pills ───────────────────────────────────────────────────────────────

function PillShell({
  children,
  href,
  title,
}: {
  children: React.ReactNode;
  href?: string;
  title?: string;
}) {
  const cls = cn(
    'inline-flex items-center gap-2 rounded-full border border-nativz-border',
    'bg-background/50 px-3 py-1.5 text-xs',
    'transition-colors',
    href && 'hover:bg-surface-hover hover:border-accent/30 cursor-pointer',
  );
  if (href) {
    return (
      <Link href={href} title={title} className={cls}>
        {children}
      </Link>
    );
  }
  return <span className={cls} title={title}>{children}</span>;
}

function SocialsPill({
  slots,
  linked,
}: {
  slots: SocialSlot[] | null;
  linked: number;
}) {
  const total = 4;
  const ready = slots !== null;
  return (
    <PillShell href="#integrations" title="Linked social profiles">
      <Link2 size={12} className="text-text-muted" />
      <span className="text-text-secondary">Socials</span>
      <span className="text-text-primary font-semibold tabular-nums">
        {ready ? `${linked} / ${total}` : '—'}
      </span>
      <span className="flex items-center gap-1">
        {PLATFORM_ORDER.map((p) => {
          const isLinked = !!slots?.find((s) => s.platform === p && s.status === 'linked');
          return (
            <span
              key={p}
              aria-label={`${p} ${isLinked ? 'linked' : 'not linked'}`}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isLinked ? 'bg-accent' : 'bg-nativz-border',
              )}
            />
          );
        })}
      </span>
    </PillShell>
  );
}

function CompetitorsPill({
  count,
  href,
}: {
  count: number | null;
  href?: string;
}) {
  const ready = count !== null;
  return (
    <PillShell
      href={href}
      title={href ? 'View brand profile' : 'Competitors tracked'}
    >
      <Users2 size={12} className="text-text-muted" />
      <span className="text-text-secondary">Competitors</span>
      <span className="text-text-primary font-semibold tabular-nums">
        {ready ? count : '—'}
      </span>
      {ready && count === 0 && (
        <span className="text-text-muted italic">none yet</span>
      )}
    </PillShell>
  );
}

function BrandDnaPill({
  status,
  updatedAt,
  href,
}: {
  status: BrandDnaStatus;
  updatedAt: string | null;
  href?: string;
}) {
  let label: React.ReactNode;
  let dotClass = 'bg-nativz-border';
  if (status === 'generating') {
    label = <span className="text-text-secondary">Generating…</span>;
    dotClass = 'bg-accent animate-pulse';
  } else if (status === 'generated') {
    label = (
      <>
        <span className="text-text-secondary">Generated</span>
        {updatedAt && (
          <span className="text-text-muted">· {relativeTime(updatedAt)}</span>
        )}
      </>
    );
    dotClass = 'bg-accent';
  } else {
    label = <span className="italic text-text-muted">never generated</span>;
  }

  return (
    <PillShell href={href} title="Brand DNA">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotClass)} />
      <Sparkles size={12} className="text-text-muted" />
      <span className="text-text-secondary">Brand DNA</span>
      {label}
      {href && <Eye size={11} className="text-text-muted ml-0.5" aria-hidden />}
    </PillShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diffMs = Date.now() - d;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}
