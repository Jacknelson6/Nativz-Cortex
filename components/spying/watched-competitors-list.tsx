'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Radar } from 'lucide-react';
import { WatchHistoryDrawer } from '@/components/spying/watch-history-drawer';

interface WatchRow {
  id: string;
  client_id: string;
  client_name: string;
  client_logo: string | null;
  cadence: string;
  last_snapshot_at: string | null;
  platform: string | null;
  handle: string | null;
  display_name: string | null;
  followers: number | null;
  delta_pct: number | null;
  series: number[];
}

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MiniChart({
  values,
  positive,
  className,
}: {
  values: number[];
  positive: boolean | null;
  className?: string;
}) {
  if (values.length < 2) return <div className={`h-7 w-20 ${className ?? ''}`} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => ({
    x: i * step,
    y: h - ((v - min) / range) * h,
  }));
  const linePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`;
  const stroke =
    positive === null ? 'currentColor' : positive ? '#34D399' : '#F87171';
  const fillId = `mini-${stroke.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${fillId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="1.8" fill={stroke} />
    </svg>
  );
}

const PLATFORM_MARK: Record<string, { bg: string; label: string }> = {
  tiktok: { bg: 'bg-pink-400/15 text-pink-200', label: 'TT' },
  instagram: { bg: 'bg-fuchsia-400/15 text-fuchsia-200', label: 'IG' },
  youtube: { bg: 'bg-red-400/15 text-red-200', label: 'YT' },
  facebook: { bg: 'bg-blue-400/15 text-blue-200', label: 'FB' },
};

export function WatchedCompetitorsList({ watches }: { watches: WatchRow[] }) {
  const [activeWatch, setActiveWatch] = useState<WatchRow | null>(null);
  const sorted = [...watches]
    .sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0))
    .slice(0, 6);

  if (sorted.length === 0) return null;

  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '300ms' }}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow text-accent-text/80">In-flight</p>
          <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
            Watched competitors
          </h2>
        </div>
        <Link
          href="/admin/analytics?tab=benchmarking"
          className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-text"
        >
          Open benchmarking <ArrowRight size={12} />
        </Link>
      </div>

      <ul className="divide-y divide-nativz-border/60 overflow-hidden rounded-xl border border-nativz-border bg-surface">
        {sorted.map((w) => {
          const platform = w.platform ? PLATFORM_MARK[w.platform] : null;
          const deltaTone =
            w.delta_pct == null || w.delta_pct === 0
              ? 'text-text-muted'
              : w.delta_pct > 0
                ? 'text-emerald-300'
                : 'text-coral-300';
          const deltaLabel =
            w.delta_pct == null
              ? '—'
              : `${w.delta_pct > 0 ? '+' : ''}${(w.delta_pct * 100).toFixed(1)}%`;
          const positiveDirection =
            w.delta_pct == null ? null : w.delta_pct >= 0;
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => setActiveWatch(w)}
                className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-hover/40 focus-visible:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/10 text-accent-text">
                  {w.client_logo ? (
                    <Image
                      src={w.client_logo}
                      alt=""
                      width={36}
                      height={36}
                      sizes="36px"
                      className="h-9 w-9 object-cover"
                    />
                  ) : (
                    <Radar size={14} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-semibold text-text-primary">
                      {w.handle ? `@${w.handle}` : w.client_name}
                    </span>
                    {platform ? (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${platform.bg}`}
                      >
                        {platform.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-text-muted">
                    {w.client_name} · {w.cadence} · {timeAgo(w.last_snapshot_at)}
                  </div>
                </div>
                <MiniChart
                  values={w.series.length ? w.series : [0, 0]}
                  positive={positiveDirection}
                  className="hidden sm:block"
                />
                <div className="hidden shrink-0 text-right font-mono text-[11px] tabular-nums sm:block">
                  <div className="text-text-primary">{compactNumber(w.followers)}</div>
                  <div className={deltaTone}>{deltaLabel}</div>
                </div>
                <ArrowRight
                  size={13}
                  className="shrink-0 text-text-muted/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent-text"
                />
              </button>
            </li>
          );
        })}
      </ul>

      <WatchHistoryDrawer
        open={activeWatch !== null}
        onClose={() => setActiveWatch(null)}
        watchId={activeWatch?.id ?? null}
        fallbackTitle={activeWatch?.handle ? `@${activeWatch.handle}` : activeWatch?.client_name ?? ''}
        fallbackSubtitle={activeWatch?.client_name ?? ''}
        fallbackLogo={activeWatch?.client_logo ?? null}
        fallbackPlatform={activeWatch?.platform ?? null}
      />
    </section>
  );
}
