// ZNA-02: percentage delta vs prior equal-length window. Suppresses the
// delta when the prior window is sparse (<60% coverage) or its mean is zero
// (no meaningful base to compare against).

import type { DeltaMetric, DeltaResult, RangeKey, TimeseriesPoint } from '@/lib/analytics/types';

function comparisonLength(range: RangeKey): number {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  // 'all' compares the most recent 30 days vs the 30 before.
  return 30;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeDelta(args: {
  points: TimeseriesPoint[];
  range: RangeKey;
  metric: DeltaMetric;
}): DeltaResult {
  const n = comparisonLength(args.range);
  const all = args.points;
  const current = all.slice(-n);
  const prior = all.slice(-2 * n, -n);

  const currentValues = current.map((p) => p[args.metric]);
  const priorValues = prior.map((p) => p[args.metric]);
  const currentMean = mean(currentValues);
  const priorMean = mean(priorValues);

  // Sparse-window suppression (D-07).
  if (priorValues.length / n < 0.6) {
    return {
      metric: args.metric,
      current_mean: currentMean,
      prior_mean: priorMean,
      delta_pct: null,
      suppressed: true,
      suppressed_reason: 'sparse_prior_window',
    };
  }

  // Zero-prior guard (avoid division by zero / infinite delta).
  if (priorMean === 0) {
    return {
      metric: args.metric,
      current_mean: currentMean,
      prior_mean: priorMean,
      delta_pct: null,
      suppressed: true,
      suppressed_reason: 'sparse_prior_window',
    };
  }

  const pct = ((currentMean - priorMean) / priorMean) * 100;
  return {
    metric: args.metric,
    current_mean: currentMean,
    prior_mean: priorMean,
    delta_pct: Math.round(pct * 10) / 10,
    suppressed: false,
    suppressed_reason: null,
  };
}
