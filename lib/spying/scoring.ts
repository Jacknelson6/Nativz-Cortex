/**
 * Spy benchmarking scoring model.
 *
 * Composite per-platform score in [0, 100], averaged across the platforms a
 * brand operates on to produce the brand-level score. Scoring is forward-only
 * — every snapshot row stores the score of *that* snapshot; we never
 * back-fill historical rows.
 *
 * Weights are deliberately platform-aware: TikTok bios don't carry the same
 * weight as Instagram bios, so the IG bio component is redistributed into
 * Velocity / Engagement / Reach / Caption when the platform is `tiktok`.
 *
 * See `rubrics.ts` for the LLM-graded Bio + Caption components, and
 * `score-snapshot.ts` for the glue that turns a scraped (profile, videos)
 * into a `PlatformScore`.
 */

export type ScoringPlatform = 'instagram' | 'tiktok';

export interface PlatformWeights {
  velocity: number;
  engagement: number;
  reach: number;
  bio: number;
  caption: number;
}

/**
 * Velocity gets the lion's share because cadence is the single highest
 * predictor of growth in short-form. Bio applies on IG only — TikTok's bio
 * is too constrained to grade meaningfully, so its weight rolls into the
 * other four proportionally.
 */
export const PLATFORM_WEIGHTS: Record<ScoringPlatform, PlatformWeights> = {
  instagram: { velocity: 0.4, engagement: 0.15, reach: 0.15, bio: 0.2, caption: 0.1 },
  tiktok: { velocity: 0.5, engagement: 0.1875, reach: 0.1875, bio: 0, caption: 0.125 },
};

/** 8 posts/mo = 2/wk = the cadence target. */
export const VELOCITY_PAR_POSTS_PER_MONTH = 8;

export interface ComponentScores {
  velocity: number;
  engagement: number;
  reach: number;
  bio: number;
  caption: number;
}

export interface PlatformScore {
  platform: ScoringPlatform;
  components: ComponentScores;
  composite: number;
}

/**
 * Velocity score from posts in the last 30 days.
 *
 * Curve: linear 0 → 75 below par, then asymptotic toward 100 above par. The
 * asymptote is intentional — we want to reward consistent cadence, not
 * runaway volume that's gaming the metric.
 */
export function scoreVelocity(postsPerMonth: number): number {
  if (postsPerMonth <= 0) return 0;
  if (postsPerMonth < VELOCITY_PAR_POSTS_PER_MONTH) {
    return (postsPerMonth / VELOCITY_PAR_POSTS_PER_MONTH) * 75;
  }
  const overPar = postsPerMonth - VELOCITY_PAR_POSTS_PER_MONTH;
  // 8 → 75, 16 → ~84, 24 → ~89, 40 → ~95, asymptotic to 100.
  return Math.min(100, 75 + 25 * (1 - Math.exp(-overPar / VELOCITY_PAR_POSTS_PER_MONTH)));
}

/**
 * Engagement score from raw median per-post engagement (likes + comments).
 * Not normalized to followers — followers aren't reliably public, and we
 * don't want to penalize accounts whose follower count is hidden.
 *
 * Log-scaled: 100 ≈ 50pts, 1k ≈ 75pts, 10k ≈ 100pts. Anything north of 10k
 * median engagement is already best-in-class for short-form.
 */
export function scoreEngagement(medianEngagement: number): number {
  if (medianEngagement <= 0) return 0;
  const log = Math.log10(Math.max(1, medianEngagement));
  return Math.min(100, log * 25);
}

/**
 * Reach score from median views per post.
 *
 * Log-scaled: 1k ≈ 25, 10k ≈ 50, 100k ≈ 75, 1M ≈ 100. Six log-decades from 1
 * to 1M, scaled to 100 — a million-view median is the ceiling for any
 * reasonable comparison.
 */
export function scoreReach(medianViews: number): number {
  if (medianViews <= 0) return 0;
  const log = Math.log10(Math.max(1, medianViews));
  return Math.min(100, log * (100 / 6));
}

/**
 * Compose per-platform component scores into a 0..100 composite, applying
 * the platform's weight set. Bio passes through as 0 on TikTok.
 */
export function composePlatformScore(
  platform: ScoringPlatform,
  components: ComponentScores,
): number {
  const w = PLATFORM_WEIGHTS[platform];
  const composite =
    components.velocity * w.velocity +
    components.engagement * w.engagement +
    components.reach * w.reach +
    components.bio * w.bio +
    components.caption * w.caption;
  return clamp01to100(composite);
}

/**
 * Brand score = simple average of per-platform composites. Brands with
 * uneven platform performance get a real penalty here — that's intentional.
 * The point of the brand score is "are they showing up everywhere they
 * said they would," not "how good is their best platform."
 */
export function brandScore(platformScores: PlatformScore[]): number {
  if (platformScores.length === 0) return 0;
  const total = platformScores.reduce((sum, p) => sum + p.composite, 0);
  return clamp01to100(total / platformScores.length);
}

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
