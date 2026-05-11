/**
 * ZNA-06: Pure trajectory classifier + sample-cadence helpers.
 *
 * `classifyTrajectory` takes a sorted list of timepoints and the post's
 * publish timestamp and returns a deterministic status (`still_climbing`,
 * `peaked`, `declining`, `dead`, or `too_fresh`) plus the 24h/72h ratios
 * and a 7-bucket sparkline of last-24h-rolling totals.
 *
 * `nextDueTick` decides when the next sample for a given post is due,
 * walking 1h -> 6h -> 24h -> 48h -> 72h -> daily through day 30.
 */

export type TrajectoryStatus =
  | 'still_climbing'
  | 'peaked'
  | 'declining'
  | 'dead'
  | 'too_fresh';

export interface Timepoint {
  captured_at: string;
  views_count: number;
}

export interface ClassifyInput {
  publishedAt: string;
  timepoints: Timepoint[];
  now?: Date;
}

export interface ClassifyOutput {
  status: TrajectoryStatus;
  r24: number | null;
  r72: number | null;
  age_hours: number;
  sparkline_views: number[];
}

export const SAMPLE_OFFSETS_HOURS: number[] = [1, 6, 24, 48, 72];
export const DAILY_THROUGH_DAYS = 30;
export const TOO_FRESH_HOURS = 48;
export const STILL_CLIMBING_R24 = 1.10;
export const PEAKED_BAND_LOW = 0.85;
export const DEAD_R24_MAX = 0.20;
export const DEAD_AGE_DAYS_MIN = 14;
export const PEAKED_AGE_DAYS_MAX = 7;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function roundRatio(r: number): number {
  if (!Number.isFinite(r)) return 999.999;
  return Math.round(r * 1000) / 1000;
}

/**
 * Compute the views captured during the window [endMs - windowMs, endMs].
 * Uses the highest view count in [start, end] minus the highest in
 * (-inf, start] - because views are cumulative, the difference is the
 * net new views that landed in the window.
 */
function windowDelta(
  points: Array<{ ms: number; views: number }>,
  endMs: number,
  windowMs: number,
): number {
  const startMs = endMs - windowMs;
  let inWindow = 0;
  let beforeStart = 0;
  for (const p of points) {
    if (p.ms <= startMs) {
      if (p.views > beforeStart) beforeStart = p.views;
    }
    if (p.ms > startMs && p.ms <= endMs) {
      if (p.views > inWindow) inWindow = p.views;
    }
  }
  if (inWindow === 0) return 0;
  return Math.max(0, inWindow - beforeStart);
}

function buildSparkline(
  points: Array<{ ms: number; views: number }>,
  nowMs: number,
): number[] {
  const buckets: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const endMs = nowMs - i * DAY_MS;
    buckets.push(windowDelta(points, endMs, DAY_MS));
  }
  return buckets;
}

export function classifyTrajectory(input: ClassifyInput): ClassifyOutput {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const publishedMs = new Date(input.publishedAt).getTime();
  const age_hours = Math.max(0, Math.floor((nowMs - publishedMs) / HOUR_MS));
  const age_days = age_hours / 24;

  const points = input.timepoints
    .map((tp) => ({ ms: new Date(tp.captured_at).getTime(), views: tp.views_count ?? 0 }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);

  const sparkline_views = buildSparkline(points, nowMs);

  if (age_hours < TOO_FRESH_HOURS) {
    return {
      status: 'too_fresh',
      r24: null,
      r72: null,
      age_hours,
      sparkline_views,
    };
  }

  const last24 = windowDelta(points, nowMs, DAY_MS);
  const prior24 = windowDelta(points, nowMs - DAY_MS, DAY_MS);
  const last72 = windowDelta(points, nowMs, 3 * DAY_MS);
  const prior72 = windowDelta(points, nowMs - 3 * DAY_MS, 3 * DAY_MS);

  const r24Raw =
    prior24 === 0
      ? last24 > 0
        ? Number.POSITIVE_INFINITY
        : 0
      : last24 / prior24;
  const r72Raw =
    prior72 === 0
      ? last72 > 0
        ? Number.POSITIVE_INFINITY
        : 0
      : last72 / prior72;
  const r24 = roundRatio(r24Raw);
  const r72 = roundRatio(r72Raw);

  let status: TrajectoryStatus;
  if (r24Raw >= STILL_CLIMBING_R24) {
    status = 'still_climbing';
  } else if (r24Raw < DEAD_R24_MAX && age_days >= DEAD_AGE_DAYS_MIN) {
    status = 'dead';
  } else if (r24Raw < PEAKED_BAND_LOW) {
    status = 'declining';
  } else if (age_days <= PEAKED_AGE_DAYS_MAX) {
    status = 'peaked';
  } else {
    status = 'declining';
  }

  return { status, r24, r72, age_hours, sparkline_views };
}

export interface NextDueArgs {
  publishedAt: string;
  lastCapturedAt: string | null;
  now?: Date;
}

/**
 * Return the next time a sample is due for this post. Walks the
 * 1h/6h/24h/48h/72h cadence then daily through day 30. After 30 days
 * the post is considered done and we return a sentinel far in the
 * future; the caller filters those out.
 */
export function nextDueTick(args: NextDueArgs): Date {
  const now = args.now ?? new Date();
  const publishedMs = new Date(args.publishedAt).getTime();
  const ageHours = (now.getTime() - publishedMs) / HOUR_MS;

  if (!args.lastCapturedAt) {
    return new Date(publishedMs + 1 * HOUR_MS);
  }

  // Find smallest scheduled offset strictly greater than current age.
  for (const offset of SAMPLE_OFFSETS_HOURS) {
    if (ageHours < offset) {
      return new Date(publishedMs + offset * HOUR_MS);
    }
  }
  // Daily mode: snap to next 24h tick from published_at up to day 30.
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays >= DAILY_THROUGH_DAYS) {
    return new Date(publishedMs + (DAILY_THROUGH_DAYS + 365) * DAY_MS);
  }
  return new Date(publishedMs + (ageDays + 1) * DAY_MS);
}
