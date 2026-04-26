'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Globe, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { VersusAuditRow, VersusPlatformId, VersusPlatformSummary } from './versus-types';

const PLATFORM_LABELS: Record<VersusPlatformId, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

const PLATFORM_COLORS: Record<VersusPlatformId, string> = {
  tiktok: '#FF0050',
  instagram: '#C13584',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
};

const PLATFORM_ORDER: VersusPlatformId[] = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'];

/** Convert the human-formatted cadence string back to posts-per-day so we
 *  can pick a winner numerically. Returns -1 for "dormant"/"unknown" so
 *  those slots lose to any real cadence. Mirrors the format produced by
 *  estimatePostingFrequency() in lib/audit/analyze.ts. */
function cadenceToPerDay(label: string): number {
  if (!label || label === 'unknown' || label === 'dormant') return -1;
  if (label === 'under 1 post/month') return 1 / 60;
  let m = label.match(/^(\d+(?:\.\d+)?)\s*posts?\/day$/);
  if (m) return parseFloat(m[1]);
  m = label.match(/^(\d+(?:\.\d+)?)\s*posts?\/week$/);
  if (m) return parseFloat(m[1]) / 7;
  m = label.match(/^(\d+(?:\.\d+)?)\s*posts?\/month$/);
  if (m) return parseFloat(m[1]) / 30;
  m = label.match(/^(\d+)\s+post(?:s)? in last 90 days$/);
  if (m) return parseFloat(m[1]) / 90;
  return -1;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatEr(er: number): string {
  if (!Number.isFinite(er) || er <= 0) return '—';
  return `${(er * 100).toFixed(2)}%`;
}

interface VersusComparisonProps {
  auditA: VersusAuditRow;
  auditB: VersusAuditRow;
}

export function VersusComparison({ auditA, auditB }: VersusComparisonProps) {
  const platformsByA = useMemo(() => {
    const m = new Map<VersusPlatformId, VersusPlatformSummary>();
    for (const p of auditA.platforms) m.set(p.platform, p);
    return m;
  }, [auditA]);

  const platformsByB = useMemo(() => {
    const m = new Map<VersusPlatformId, VersusPlatformSummary>();
    for (const p of auditB.platforms) m.set(p.platform, p);
    return m;
  }, [auditB]);

  const presentPlatforms = useMemo(() => {
    const set = new Set<VersusPlatformId>();
    for (const p of auditA.platforms) set.add(p.platform);
    for (const p of auditB.platforms) set.add(p.platform);
    return PLATFORM_ORDER.filter((p) => set.has(p));
  }, [auditA, auditB]);

  // Tally winner across all platforms × all numeric metrics so the verdict
  // strip can summarise the head-to-head in one line. Cadence is included
  // when both sides have a parseable rate.
  const tally = useMemo(() => {
    let aWins = 0;
    let bWins = 0;
    for (const platform of presentPlatforms) {
      const a = platformsByA.get(platform);
      const b = platformsByB.get(platform);
      if (!a || !b) continue;
      if (a.followers !== b.followers) {
        if (a.followers > b.followers) aWins++;
        else bWins++;
      }
      if (a.avgViews !== b.avgViews) {
        if (a.avgViews > b.avgViews) aWins++;
        else bWins++;
      }
      if (a.engagementRate !== b.engagementRate) {
        if (a.engagementRate > b.engagementRate) aWins++;
        else bWins++;
      }
      const aRate = cadenceToPerDay(a.postingFrequency);
      const bRate = cadenceToPerDay(b.postingFrequency);
      if (aRate >= 0 && bRate >= 0 && aRate !== bRate) {
        if (aRate > bRate) aWins++;
        else bWins++;
      }
    }
    return { aWins, bWins };
  }, [presentPlatforms, platformsByA, platformsByB]);

  const verdict =
    tally.aWins === tally.bWins
      ? 'Even split across the metrics we can score.'
      : tally.aWins > tally.bWins
        ? `${auditA.brand_name} leads ${tally.aWins}–${tally.bWins} across scored metrics.`
        : `${auditB.brand_name} leads ${tally.bWins}–${tally.aWins} across scored metrics.`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-nativz-border bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Trophy size={14} className="text-accent-text" />
          <span>{verdict}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {presentPlatforms.map((platform) => (
          <PlatformCard
            key={platform}
            platform={platform}
            brandAName={auditA.brand_name}
            brandBName={auditB.brand_name}
            a={platformsByA.get(platform) ?? null}
            b={platformsByB.get(platform) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

interface PlatformCardProps {
  platform: VersusPlatformId;
  brandAName: string;
  brandBName: string;
  a: VersusPlatformSummary | null;
  b: VersusPlatformSummary | null;
}

function PlatformCard({ platform, brandAName, brandBName, a, b }: PlatformCardProps) {
  const color = PLATFORM_COLORS[platform];
  const label = PLATFORM_LABELS[platform];

  const aRate = a ? cadenceToPerDay(a.postingFrequency) : -1;
  const bRate = b ? cadenceToPerDay(b.postingFrequency) : -1;

  const rows: MetricRow[] = [
    {
      label: 'Followers',
      aValue: a?.followers ?? null,
      bValue: b?.followers ?? null,
      aDisplay: a ? formatNumber(a.followers) : '—',
      bDisplay: b ? formatNumber(b.followers) : '—',
    },
    {
      label: 'Avg views / post',
      aValue: a?.avgViews ?? null,
      bValue: b?.avgViews ?? null,
      aDisplay: a ? formatNumber(a.avgViews) : '—',
      bDisplay: b ? formatNumber(b.avgViews) : '—',
    },
    {
      label: 'Engagement rate',
      aValue: a?.engagementRate ?? null,
      bValue: b?.engagementRate ?? null,
      aDisplay: a ? formatEr(a.engagementRate) : '—',
      bDisplay: b ? formatEr(b.engagementRate) : '—',
    },
    {
      label: 'Cadence',
      aValue: aRate >= 0 ? aRate : null,
      bValue: bRate >= 0 ? bRate : null,
      aDisplay: a?.postingFrequency ?? '—',
      bDisplay: b?.postingFrequency ?? '—',
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between border-b border-nativz-border/60 bg-surface-hover/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-display text-sm font-semibold text-text-primary">{label}</span>
        </div>
        {a && b ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            head to head
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
            only one brand here
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        <BrandCell
          side="A"
          brandName={brandAName}
          summary={a}
          color={color}
          align="left"
        />
        <BrandCell
          side="B"
          brandName={brandBName}
          summary={b}
          color={color}
          align="right"
        />
      </div>

      <div className="border-t border-nativz-border/60">
        {rows.map((row) => (
          <MetricCompareRow key={row.label} row={row} />
        ))}
      </div>
    </div>
  );
}

interface BrandCellProps {
  side: 'A' | 'B';
  brandName: string;
  summary: VersusPlatformSummary | null;
  color: string;
  align: 'left' | 'right';
}

function BrandCell({ side, brandName, summary, color, align }: BrandCellProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3.5',
        align === 'right' && 'md:border-l border-nativz-border/60 md:flex-row-reverse md:text-right',
      )}
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ backgroundColor: `${color}25` }}
      >
        {summary?.avatarUrl ? (
          <Image
            src={summary.avatarUrl}
            alt=""
            width={40}
            height={40}
            sizes="40px"
            className="h-10 w-10 object-cover"
          />
        ) : (
          <User size={14} className="text-white/80" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Brand {side}
          </span>
          <span className="rounded-full bg-surface-hover/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-text-muted">
            {brandName}
          </span>
        </div>
        {summary ? (
          <Link
            href={summary.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 truncate text-sm font-semibold text-text-primary hover:text-accent-text',
              align === 'right' && 'md:flex-row-reverse',
            )}
          >
            <span className="truncate">@{String(summary.username).replace(/^@+/, '')}</span>
            <ExternalLink size={11} className="shrink-0 opacity-60" />
          </Link>
        ) : (
          <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-text-muted">
            <Globe size={12} className="opacity-60" /> Not on this platform
          </p>
        )}
      </div>
    </div>
  );
}

interface MetricRow {
  label: string;
  aValue: number | null;
  bValue: number | null;
  aDisplay: string;
  bDisplay: string;
}

function MetricCompareRow({ row }: { row: MetricRow }) {
  let winner: 'A' | 'B' | 'tie' | 'na' = 'na';
  if (row.aValue != null && row.bValue != null) {
    if (row.aValue === row.bValue) winner = 'tie';
    else winner = row.aValue > row.bValue ? 'A' : 'B';
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-nativz-border/60 px-4 py-2.5 text-sm last:border-b-0">
      <span
        className={cn(
          'truncate text-right font-mono tabular-nums',
          winner === 'A'
            ? 'text-emerald-300 font-semibold'
            : winner === 'B'
              ? 'text-text-muted'
              : 'text-text-secondary',
        )}
      >
        {row.aDisplay}
      </span>
      <span className="shrink-0 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted/80">
        {row.label}
      </span>
      <span
        className={cn(
          'truncate text-left font-mono tabular-nums',
          winner === 'B'
            ? 'text-emerald-300 font-semibold'
            : winner === 'A'
              ? 'text-text-muted'
              : 'text-text-secondary',
        )}
      >
        {row.bDisplay}
      </span>
    </div>
  );
}
