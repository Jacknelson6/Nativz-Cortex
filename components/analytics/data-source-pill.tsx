// SPY-08 T11: tiny pill that surfaces the analytics data source. Drop in
// next to any chart so strategists know whether they're looking at Zernio
// live data, a pre-Zernio scrape baseline, a mixed range, or an empty
// state.

import type { RangeAnalyticsSource } from '@/lib/analytics/range/types';

interface DataSourcePillProps {
  source: RangeAnalyticsSource;
  stale?: boolean;
  connectedAt?: string | null;
}

interface PillStyle {
  dot: string;
  text: string;
  label: string;
  tooltip: string | null;
}

function styleFor(source: RangeAnalyticsSource, stale: boolean, connectedAt: string | null): PillStyle {
  if (source === 'zernio') {
    if (stale) {
      return {
        dot: 'bg-amber-400',
        text: 'text-amber-200',
        label: 'Live (stale)',
        tooltip: 'Last Zernio sync was more than 24h ago — token may have expired.',
      };
    }
    return {
      dot: 'bg-emerald-400',
      text: 'text-emerald-200',
      label: 'Live',
      tooltip: 'Sourced from Zernio first-party analytics.',
    };
  }
  if (source === 'scrape') {
    return {
      dot: 'bg-text-muted',
      text: 'text-text-secondary',
      label: 'Pre-Zernio',
      tooltip: 'Sourced from the scrape pipeline (used before Zernio connected).',
    };
  }
  if (source === 'mixed') {
    return {
      dot: 'bg-sky-400',
      text: 'text-sky-200',
      label: 'Mixed',
      tooltip: connectedAt
        ? `Pre-Zernio scrape data before ${connectedAt}, Zernio data after.`
        : 'Mix of pre-Zernio scrape data and live Zernio data.',
    };
  }
  return {
    dot: 'bg-text-muted/50',
    text: 'text-text-muted',
    label: 'No data',
    tooltip: 'No analytics rows for this client/platform yet.',
  };
}

export function DataSourcePill({
  source,
  stale = false,
  connectedAt = null,
}: DataSourcePillProps) {
  const s = styleFor(source, stale, connectedAt);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-nativz-border/60 bg-surface-hover px-2 py-0.5 text-[11px] ${s.text}`}
      title={s.tooltip ?? undefined}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
