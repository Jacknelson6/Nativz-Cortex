/**
 * Glue function: turn a freshly-scraped (profile, videos) pair into a
 * fully-graded `PlatformScore`. Called by the snapshot cron on every
 * captured (benchmark, competitor) tuple, and at audit time on the brand
 * itself for the baseline score.
 *
 * The five components are computed independently:
 * - Velocity / Engagement / Reach are deterministic math off the videos.
 * - Bio / Caption are LLM-graded (rubrics.ts).
 *
 * Throws if a Bio or Caption call fails — the cron should retry rather than
 * persist a snapshot whose score is missing components. Deterministic
 * components alone are not enough; ungraded components silently bias the
 * leaderboard.
 */

import type { ProspectProfile, ProspectVideo } from '@/lib/audit/types';
import {
  composePlatformScore,
  type ComponentScores,
  type PlatformScore,
  type ScoringPlatform,
  scoreEngagement,
  scoreReach,
  scoreVelocity,
} from './scoring';
import {
  gradeBio,
  gradeCaptions,
  type BioGrade,
  type CaptionGrade,
} from './rubrics';

export interface SnapshotScoreInputs {
  platform: ScoringPlatform;
  profile: ProspectProfile;
  videos: ProspectVideo[];
  /**
   * "Now" override for tests. Production passes nothing — the function uses
   * `Date.now()`. Lets the cron's snapshot timestamp drive the 30-day window
   * if we ever need that, but the default is correct for live runs.
   */
  now?: Date;
}

export interface SnapshotScoreResult {
  score: PlatformScore;
  /** Raw inputs to each deterministic component, kept for the snapshot row. */
  inputs: {
    postsLast30d: number;
    medianEngagement: number;
    medianViews: number;
  };
  bio: BioGrade;
  captions: CaptionGrade;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function scoreSnapshot(
  args: SnapshotScoreInputs,
): Promise<SnapshotScoreResult> {
  const { platform, profile, videos, now } = args;
  const cutoff = (now?.getTime() ?? Date.now()) - THIRTY_DAYS_MS;

  const recent = videos.filter((v) => {
    if (!v.publishDate) return false;
    const t = new Date(v.publishDate).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const postsLast30d = recent.length;
  const medianEngagement = median(recent.map((v) => v.likes + v.comments + v.shares));
  const medianViews = median(recent.map((v) => v.views));

  const captionInputs = videos
    .slice()
    .sort((a, b) => publishedTime(b) - publishedTime(a))
    .slice(0, 10)
    .map((v) => ({ id: v.id, text: composeCaptionText(v) }));

  const [bio, captions] = await Promise.all([
    platform === 'instagram' ? gradeBio(profile.bio) : Promise.resolve(emptyBio()),
    gradeCaptions(captionInputs),
  ]);

  const components: ComponentScores = {
    velocity: scoreVelocity(postsLast30d),
    engagement: scoreEngagement(medianEngagement),
    reach: scoreReach(medianViews),
    bio: bio.score,
    caption: captions.score,
  };

  const composite = composePlatformScore(platform, components);

  return {
    score: { platform, components, composite },
    inputs: { postsLast30d, medianEngagement, medianViews },
    bio,
    captions,
  };
}

function median(nums: number[]): number {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function publishedTime(v: ProspectVideo): number {
  if (!v.publishDate) return 0;
  const t = new Date(v.publishDate).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Compose the caption text passed to the LLM grader. We include hashtags
 * inline so the rubric can judge the hashtag wall — the scraper splits them
 * into a separate field, so we re-attach them here.
 */
function composeCaptionText(v: ProspectVideo): string {
  const body = (v.description ?? '').trim();
  const tags = (v.hashtags ?? []).filter((t) => typeof t === 'string' && t.length > 0);
  if (tags.length === 0) return body;
  const tagWall = tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return body.length > 0 ? `${body}\n\n${tagWall}` : tagWall;
}

function emptyBio(): BioGrade {
  return {
    score: 0,
    breakdown: { clarity: 0, voice: 0, proof: 0, cta: 0, rhythm: 0, rationale: 'Bio not graded for TikTok.' },
  };
}
