import { Crown, Sparkles } from 'lucide-react';

interface LeaderboardRow {
  platform: 'instagram' | 'tiktok';
  username: string;
  display_name: string;
  is_brand: boolean;
  composite_score: number;
  components: {
    velocity: number | null;
    engagement: number | null;
    reach: number | null;
    bio: number | null;
    caption: number | null;
  };
  followers: number | null;
  engagement_rate: number | null;
  posting_frequency: string | null;
  followers_delta: number | null;
  captured_at: string;
}

interface Props {
  rows: LeaderboardRow[];
  /** When the benchmark exists but no scored snapshots have landed yet. */
  awaitingFirstSnapshot: boolean;
  /** Latest captured_at across the rows, for the header timestamp. */
  lastCapturedAt: string | null;
  brandName: string;
}

const PLATFORM_PILL: Record<LeaderboardRow['platform'], string> = {
  instagram: 'bg-fuchsia-400/10 text-fuchsia-200 ring-fuchsia-400/20',
  tiktok: 'bg-pink-400/10 text-pink-200 ring-pink-400/20',
};

const PLATFORM_LABEL: Record<LeaderboardRow['platform'], string> = {
  instagram: 'IG',
  tiktok: 'TT',
};

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtScore(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n).toString();
}

export function SpyLeaderboard({ rows, awaitingFirstSnapshot, lastCapturedAt, brandName }: Props) {
  if (awaitingFirstSnapshot) {
    return (
      <section
        className="animate-ci-rise rounded-xl border border-dashed border-nativz-border bg-surface/40 px-6 py-10 text-center"
        style={{ animationDelay: '60ms' }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-surface text-accent-text">
          <Sparkles size={20} />
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm text-text-secondary">
          Baseline queued for {brandName}. The first snapshot lands within 24 hours and seeds the leaderboard automatically.
        </p>
      </section>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '60ms' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ui-eyebrow text-accent-text/80">Spy leaderboard</p>
          <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
            {brandName} vs. tracked competitors
          </h2>
        </div>
        {lastCapturedAt ? (
          <span className="text-[11px] text-text-muted">
            Last snapshot {timeAgo(lastCapturedAt)}
          </span>
        ) : null}
      </div>

      <ul className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        {rows.map((row, i) => (
          <li
            key={`${row.platform}-${row.username}`}
            className={`flex items-center gap-4 px-5 py-4 ${
              i > 0 ? 'border-t border-nativz-border/60' : ''
            } ${row.is_brand ? 'bg-accent-surface/30' : ''}`}
          >
            <div className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-text-muted">
              {i + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-display text-sm font-semibold text-text-primary">
                  {row.display_name}
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ring-1 ring-inset ${PLATFORM_PILL[row.platform]}`}
                >
                  {PLATFORM_LABEL[row.platform]}
                </span>
                {row.is_brand ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-text">
                    <Crown size={9} aria-hidden /> You
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-muted">
                @{row.username}
                {row.followers != null ? ` · ${compactNumber(row.followers)} followers` : ''}
                {row.engagement_rate != null
                  ? ` · ${(row.engagement_rate * 100).toFixed(1)}% ER`
                  : ''}
                {row.posting_frequency ? ` · ${row.posting_frequency}` : ''}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-text-muted">
                <ComponentChip label="V" value={row.components.velocity} />
                <ComponentChip label="E" value={row.components.engagement} />
                <ComponentChip label="R" value={row.components.reach} />
                {row.platform === 'instagram' ? (
                  <ComponentChip label="B" value={row.components.bio} />
                ) : null}
                <ComponentChip label="C" value={row.components.caption} />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="font-display text-2xl font-semibold tabular-nums text-text-primary">
                {fmtScore(row.composite_score)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                composite
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComponentChip({ label, value }: { label: string; value: number | null }) {
  const tone =
    value == null
      ? 'text-text-muted/60'
      : value >= 75
        ? 'text-emerald-300'
        : value >= 50
          ? 'text-text-secondary'
          : value >= 25
            ? 'text-amber-300'
            : 'text-coral-300';
  return (
    <span className={tone}>
      {label} {fmtScore(value)}
    </span>
  );
}
