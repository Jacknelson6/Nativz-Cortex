// SPY-05 T06: lightweight competitor grader.
//
// One competitor → one ScorecardSnapshot. Reuses:
//   - lib/audit/scrape-<platform>-profile.ts for the scrape
//   - SPY-03 bio / caption / comment prompts via createCompletion
//   - SPY-04 computeScorecard() to roll the analysis into 10 R/Y/G rows
//
// Differences vs the prospect's own initial analysis (initial-analysis.ts):
//   - No profile-pic Gemini Vision call (D-06 says skip; pic grade is
//     low-info for competitors anyway).
//   - No rollup synthesis call — the benchmark UI shows the 10-row
//     comparison directly, no narrative observations needed.
//   - Posting cadence is computed deterministically from scrape timestamps
//     (same helper as initial-analysis.ts; duplicated here so the file
//     stays self-contained and importable without pulling in side-effecty
//     orchestrator code).
//
// Returns either a succeeded ScorecardSnapshot or null on hard failure;
// the orchestrator decides whether the overall benchmark is partial or
// failed depending on how many competitors succeed.

import { createCompletion } from '@/lib/ai/client';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '@/lib/audit/scrape-instagram-profile';
import { scrapeYouTubeProfile } from '@/lib/audit/scrape-youtube-profile';
import { scrapeFacebookProfile } from '@/lib/audit/scrape-facebook-profile';
import type { ProspectProfile, ProspectVideo } from '@/lib/audit/types';
import {
  BIO_SYSTEM,
  BioSchema,
  CAPTION_SYSTEM,
  CaptionPatternSchema,
  buildBioPrompt,
  buildCaptionPrompt,
  containsBannedTopic,
} from './initial-analysis-prompts';
import { computeScorecard } from './checklist';
import type { ScorecardSnapshot } from './checklist';
import type {
  ProspectPlatform,
  ProspectAnalysisRow,
  BioAssessment,
  CaptionPattern,
  CommentSignal,
  PostingCadence,
} from './types';

export interface GradeCompetitorInput {
  platform: ProspectPlatform;
  handle: string;
  displayName?: string | null;
  /** Provide a checker so the orchestrator can short-circuit mid-pipeline. */
  isCancelled?: () => boolean;
}

export interface GradeCompetitorResult {
  status: 'succeeded' | 'partial' | 'failed';
  scorecard: ScorecardSnapshot | null;
  error: string | null;
  cost_cents: number;
  raw: {
    bio: string | null;
    captions: string[];
    followers: number | null;
  };
}

async function scrapePlatform(
  platform: ProspectPlatform,
  handle: string,
): Promise<{ profile: ProspectProfile; videos: ProspectVideo[] } | null> {
  const h = handle.replace(/^@/, '');
  try {
    switch (platform) {
      case 'tiktok':
        return await scrapeTikTokProfile(`https://www.tiktok.com/@${h}`);
      case 'instagram':
        return await scrapeInstagramProfile(`https://www.instagram.com/${h}/`);
      case 'youtube':
        return await scrapeYouTubeProfile(`https://www.youtube.com/@${h}`);
      case 'facebook':
        return await scrapeFacebookProfile(`https://www.facebook.com/${h}`);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function parseJson<T>(
  text: string,
  schema: { safeParse: (x: unknown) => { success: boolean; data?: T } },
): T | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    const result = schema.safeParse(parsed);
    return result.success ? (result.data as T) : null;
  } catch {
    return null;
  }
}

function computeCadence(videos: ProspectVideo[]): PostingCadence {
  const ts = videos
    .map((v) => (v.publishDate ? new Date(v.publishDate).getTime() : null))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => b - a);

  if (ts.length < 3) {
    return { posts_per_week: ts.length, trend: 'unknown', note: 'Limited post history' };
  }

  const newest = ts[0];
  const oldest = ts[ts.length - 1];
  const spanWeeks = Math.max(1, (newest - oldest) / (7 * 24 * 60 * 60 * 1000));
  const postsPerWeek = ts.length / spanWeeks;

  const mid = Math.floor(ts.length / 2);
  const recentSpanWeeks = Math.max(1, (newest - ts[mid - 1]) / (7 * 24 * 60 * 60 * 1000));
  const olderSpanWeeks = Math.max(1, (ts[mid - 1] - oldest) / (7 * 24 * 60 * 60 * 1000));
  const recentRate = mid / recentSpanWeeks;
  const olderRate = (ts.length - mid) / olderSpanWeeks;
  let trend: PostingCadence['trend'] = 'flat';
  if (recentRate > olderRate * 1.2) trend = 'climbing';
  else if (recentRate < olderRate * 0.8) trend = 'declining';

  return { posts_per_week: Number(postsPerWeek.toFixed(2)), trend };
}

async function safeBio(
  brandName: string,
  platform: ProspectPlatform,
  bioText: string,
): Promise<{ value: BioAssessment | null; costCents: number }> {
  try {
    const res = await createCompletion({
      messages: [
        { role: 'system', content: BIO_SYSTEM },
        { role: 'user', content: buildBioPrompt({ brandName, platform, bioText }) },
      ],
      maxTokens: 400,
      jsonMode: true,
      feature: 'prospect_benchmark_competitor_bio',
    });
    const parsed = parseJson(res.text, BioSchema);
    if (!parsed) return { value: null, costCents: Math.round(res.estimatedCost * 100) };
    if (containsBannedTopic(parsed.note)) parsed.note = 'Filtered';
    return { value: parsed, costCents: Math.round(res.estimatedCost * 100) };
  } catch {
    return { value: null, costCents: 0 };
  }
}

async function safeCaption(
  brandName: string,
  platform: ProspectPlatform,
  captions: string[],
): Promise<{ value: CaptionPattern | null; costCents: number }> {
  if (captions.length < 3) {
    return {
      value: { hook_quality_avg: 0, cta_rate: 0, voice_note: 'Limited post history' },
      costCents: 0,
    };
  }
  try {
    const res = await createCompletion({
      messages: [
        { role: 'system', content: CAPTION_SYSTEM },
        { role: 'user', content: buildCaptionPrompt({ brandName, platform, captions }) },
      ],
      maxTokens: 800,
      jsonMode: true,
      feature: 'prospect_benchmark_competitor_caption',
    });
    const parsed = parseJson(res.text, CaptionPatternSchema);
    if (!parsed) return { value: null, costCents: Math.round(res.estimatedCost * 100) };
    if (containsBannedTopic(parsed.voice_note)) parsed.voice_note = 'Filtered';
    return { value: parsed, costCents: Math.round(res.estimatedCost * 100) };
  } catch {
    return { value: null, costCents: 0 };
  }
}

// No real comment scrape yet (parity with initial-analysis safeComment v1).
// Returning a zero-signal placeholder keeps the scorecard rule for comments
// pinned to NA via ruleCommentReplies's reply_rate=0 branch (yellow at
// reply_rate≥0.1; below that = red). The competitor's column simply shows
// "red" on that single dimension which is honest given we have no data.
function placeholderCommentSignal(): CommentSignal {
  return {
    sentiment_score: 0,
    recurring_themes: [],
    reply_rate: 0,
    note: 'No competitor comment scrape in v1.',
  };
}

export async function gradeCompetitor(input: GradeCompetitorInput): Promise<GradeCompetitorResult> {
  const cancelled = () => input.isCancelled?.() ?? false;

  if (cancelled()) {
    return { status: 'failed', scorecard: null, error: 'Cancelled', cost_cents: 0, raw: { bio: null, captions: [], followers: null } };
  }

  const scraped = await scrapePlatform(input.platform, input.handle);
  if (!scraped || scraped.videos.length === 0) {
    return {
      status: 'failed',
      scorecard: null,
      error: scraped ? 'No public posts to analyse' : 'Profile scrape failed',
      cost_cents: 0,
      raw: { bio: scraped?.profile.bio ?? null, captions: [], followers: scraped?.profile.followers ?? null },
    };
  }

  if (cancelled()) {
    return { status: 'failed', scorecard: null, error: 'Cancelled', cost_cents: 0, raw: { bio: scraped.profile.bio ?? null, captions: [], followers: scraped.profile.followers } };
  }

  const captions = scraped.videos.slice(0, 15).map((v) => v.description ?? '');
  const cadence = computeCadence(scraped.videos);

  const [bioRes, captionRes] = await Promise.all([
    safeBio(input.displayName ?? input.handle, input.platform, scraped.profile.bio ?? ''),
    safeCaption(input.displayName ?? input.handle, input.platform, captions),
  ]);

  if (cancelled()) {
    return { status: 'failed', scorecard: null, error: 'Cancelled', cost_cents: bioRes.costCents + captionRes.costCents, raw: { bio: scraped.profile.bio ?? null, captions, followers: scraped.profile.followers } };
  }

  // Synthesise a ProspectAnalysisRow-shaped object so computeScorecard()
  // can grade it identically to the prospect. Only the fields the checklist
  // rules actually touch need to be set; the rest can be empty/null without
  // affecting the output.
  const synthetic: ProspectAnalysisRow = {
    id: 'synthetic',
    prospect_id: '',
    run_id: 'synthetic',
    platform: input.platform,
    handle: input.handle,
    status: 'succeeded',
    error_message: null,
    duration_ms: null,
    cost_cents: null,
    raw_profile: scraped.profile as unknown as Record<string, unknown>,
    raw_captions: captions,
    raw_comments: [],
    profile_pic_assessment: scraped.profile.avatarUrl
      ? { rating: 'okay', note: 'Auto-assessment skipped for competitor.', image_url: scraped.profile.avatarUrl }
      : { rating: 'weak', note: 'No profile picture set.', image_url: null },
    bio_assessment: bioRes.value,
    caption_pattern: captionRes.value,
    comment_signal: placeholderCommentSignal(),
    posting_cadence: cadence,
    observations: null,
    biggest_opportunity: null,
    overrides: {},
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const snapshot = computeScorecard(synthetic);

  const allSubOk = bioRes.value !== null && captionRes.value !== null;

  return {
    status: allSubOk ? 'succeeded' : 'partial',
    scorecard: snapshot,
    error: allSubOk ? null : 'Partial: one or more sub-steps returned no data',
    cost_cents: bioRes.costCents + captionRes.costCents,
    raw: { bio: scraped.profile.bio ?? null, captions, followers: scraped.profile.followers },
  };
}
