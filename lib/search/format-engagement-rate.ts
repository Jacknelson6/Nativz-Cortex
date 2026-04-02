/**
 * Format stored engagement for UI. New pipeline values are **percentage points**
 * (0.7 → 0.7%, not 70%). Legacy merger output sometimes used a 0–1 fraction
 * (e.g. 0.007); values strictly between 0 and 0.01 are treated as fractions.
 */
export function formatEngagementRatePercent(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  if (value > 0 && value < 0.01) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(1)}%`;
}
