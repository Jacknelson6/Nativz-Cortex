import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Radar } from 'lucide-react';

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

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className={`h-4 w-14 ${className ?? ''}`} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 56;
  const h = 16;
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
  tiktok: { bg: 'bg-pink-400/15 text-pink-200', label: 'TT' },
  instagram: { bg: 'bg-fuchsia-400/15 text-fuchsia-200', label: 'IG' },
  youtube: { bg: 'bg-red-400/15 text-red-200', label: 'YT' },
  facebook: { bg: 'bg-blue-400/15 text-blue-200', label: 'FB' },
};

export function WatchedCompetitorsList({ watches }: { watches: WatchRow[] }) {
  const sorted = [...watches]
    .sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0))
    .slice(0, 6);

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

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
          No competitors enrolled. Run an audit and click{' '}
          <span className="text-accent-text">Watch this competitor</span> on any result, or{' '}
          <Link href="/spying/watch" className="text-accent-text underline decoration-dotted">
            set up watch
          </Link>
          .
        </div>
      ) : (
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
            return (
              <li key={w.id}>
                <Link
                  href={`/admin/analytics?tab=benchmarking&competitor=${w.id}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover/40 focus-visible:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
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
                  <Sparkline
                    values={w.series.length ? w.series : [0, 0]}
                    className="hidden text-accent sm:block"
                  />
                  <div className="hidden shrink-0 text-right font-mono text-[11px] tabular-nums sm:block">
                    <div className="text-text-primary">{compactNumber(w.followers)}</div>
                    <div className={deltaTone}>{deltaLabel}</div>
                  </div>
                  <ArrowRight
                    size={13}
                    className="shrink-0 text-text-muted/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent-text"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
