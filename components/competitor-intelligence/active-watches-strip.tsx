import Link from 'next/link';
import { ArrowRight, Radar } from 'lucide-react';

interface WatchCard {
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

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return <div className={`h-5 w-16 ${className ?? ''}`} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-ci-sparkline"
        style={{ strokeDasharray: 200, strokeDashoffset: 200 }}
      />
    </svg>
  );
}

const PLATFORM_MARK: Record<string, { bg: string; label: string }> = {
  tiktok: { bg: 'bg-pink-400/20 text-pink-200', label: 'TT' },
  instagram: { bg: 'bg-fuchsia-400/20 text-fuchsia-200', label: 'IG' },
  youtube: { bg: 'bg-red-400/20 text-red-200', label: 'YT' },
  facebook: { bg: 'bg-blue-400/20 text-blue-200', label: 'FB' },
};

export function ActiveWatchesStrip({ watches }: { watches: WatchCard[] }) {
  return (
    <section className="animate-ci-rise space-y-3" style={{ animationDelay: '400ms' }}>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
            style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
          >
            In-flight
          </p>
          <h2
            className="mt-1 text-xl font-semibold text-text-primary"
            style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
          >
            Watched competitors
          </h2>
        </div>
        <Link
          href="/admin/analytics?tab=benchmarking"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-cyan-300"
        >
          Open benchmarking <ArrowRight size={13} />
        </Link>
      </div>

      {watches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
          No competitors enrolled yet — run an audit and hit{' '}
          <span className="text-cyan-300">Watch this competitor</span> on any result, or jump into{' '}
          <Link href="/admin/competitor-spying/watch" className="text-cyan-300 underline decoration-dotted">
            set up watch
          </Link>
          .
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {watches.map((w) => {
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
            return (
              <Link
                key={w.id}
                href={`/admin/analytics?tab=benchmarking&competitor=${w.id}`}
                className="group flex min-w-[260px] flex-1 items-center gap-3 rounded-2xl border border-nativz-border bg-surface p-3 transition-all hover:-translate-y-0.5 hover:border-cyan-500/30"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                  {w.client_logo ? (
                    <img src={w.client_logo} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <Radar size={16} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="truncate text-sm font-semibold text-text-primary"
                      style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
                    >
                      {w.handle ? `@${w.handle}` : w.client_name}
                    </span>
                    {platform && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${platform.bg}`}>
                        {platform.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span>{w.client_name}</span>
                    <span>·</span>
                    <span>{w.cadence}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Sparkline values={w.series.length ? w.series : [0, 0]} className="text-cyan-400" />
                  <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums">
                    <span className="text-text-primary">{compactNumber(w.followers)}</span>
                    <span className={deltaTone}>{deltaLabel}</span>
                  </div>
                  <div className="font-mono text-[9px] text-text-muted/80">{timeAgo(w.last_snapshot_at)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
