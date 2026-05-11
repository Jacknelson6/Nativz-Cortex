// ZNA-05: Per-post good/bad indicator dot for the post card.
//
// One of four states, each color-coded against the dark theme tokens. The
// title attribute carries the math so power users can read the ratio /
// baseline without us shipping a tooltip portal.

'use client';

import type { PostCardSignal } from '@/lib/analytics/resolve-post-signals';

const COLORS: Record<PostCardSignal['classification'], string> = {
  above_avg: 'bg-emerald-400',
  avg: 'bg-zinc-400',
  below_avg: 'bg-red-400',
  too_fresh: 'bg-zinc-500/60',
};

const LABELS: Record<PostCardSignal['classification'], string> = {
  above_avg: 'Above average',
  avg: 'Average',
  below_avg: 'Below average',
  too_fresh: 'Too fresh',
};

function buildTitle(signal: PostCardSignal): string {
  const label = LABELS[signal.classification];
  if (signal.classification === 'too_fresh') {
    if (signal.reason === 'sparse_baseline') {
      return `${label} - not enough recent posts to compare yet.`;
    }
    return `${label} - posted within the last 48 hours.`;
  }
  if (signal.ratio == null || signal.baseline_mean == null) return label;
  const pct = Math.round(signal.ratio * 100);
  const base = Math.round(signal.baseline_mean).toLocaleString();
  return `${label} - ${pct}% of brand's ${signal.baseline_window_days}-day average (${base} views, n=${signal.baseline_sample_size}).`;
}

export function PostSignalDot({ signal }: { signal: PostCardSignal }) {
  const color = COLORS[signal.classification];
  return (
    <span
      title={buildTitle(signal)}
      aria-label={LABELS[signal.classification]}
      className={`inline-block h-3.5 w-3.5 rounded-full ring-2 ring-black/40 ${color}`}
    />
  );
}
