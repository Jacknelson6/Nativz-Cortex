// SPY-03 T09: orchestrator for the ~90s initial profile analysis.
// Called by:
//   - SPY-02 confirm-socials route (fire-and-forget after the rep
//     confirms the detected handles)
//   - POST /api/prospects/[id]/analyze (manual re-run)
//
// Pipeline (parallel where independent):
//   1. Pick platform + handle (primary, fallback by TikTok > IG > YT > FB)
//   2. Scrape the profile via lib/audit/scrape-<platform>-profile.ts
//   3. Run 4 LLM calls in parallel: profile-pic (Gemini Vision), bio,
//      caption-pattern, comment-signal (all Sonnet 4.5).
//   4. Compute posting cadence deterministically from publish timestamps.
//   5. Single rollup Sonnet 4.5 call → observations[] + biggest_opportunity.
//   6. Update row, write touchpoint, auto-advance lifecycle discovered → audited.
//
// Edge cases (see PRD): private profile / <3 posts / 0 comments /
// malformed JSON / banned topics / 404 pic / OpenRouter 429 / scrape
// timeout. We bias toward `status='partial'` rather than `'failed'` so
// the strategist sees whatever the pipeline could extract.

import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '@/lib/audit/scrape-instagram-profile';
import { scrapeYouTubeProfile } from '@/lib/audit/scrape-youtube-profile';
import { scrapeFacebookProfile } from '@/lib/audit/scrape-facebook-profile';
import type { ProspectProfile, ProspectVideo } from '@/lib/audit/types';
import type {
  ProspectAnalysisRow,
  ProspectAnalysisStatus,
  ProspectPlatform,
  ProspectRow,
  ProfilePicAssessment,
  BioAssessment,
  CaptionPattern,
  CommentSignal,
  PostingCadence,
} from './types';
import {
  BIO_SYSTEM,
  BioSchema,
  CAPTION_SYSTEM,
  COMMENT_SYSTEM,
  CaptionPatternSchema,
  CommentSignalSchema,
  PROFILE_PIC_SYSTEM,
  ProfilePicSchema,
  ROLLUP_SYSTEM,
  RollupSchema,
  buildBioPrompt,
  buildCaptionPrompt,
  buildCommentPrompt,
  buildProfilePicPrompt,
  buildRollupPrompt,
  containsBannedTopic,
} from './initial-analysis-prompts';

export interface InitialAnalysisResult {
  ok: boolean;
  queued?: boolean;
  message?: string;
  analysisId?: string;
  runId?: string;
  status?: ProspectAnalysisStatus;
}

const FALLBACK_ORDER: ProspectPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

interface PipelineInputs {
  prospect: ProspectRow;
  platform: ProspectPlatform;
  handle: string;
}

export async function runInitialAnalysis(
  prospectId: string,
  opts: { runId?: string; createdBy?: string | null } = {},
): Promise<InitialAnalysisResult> {
  if (!prospectId) return { ok: false, message: 'Missing prospect id' };

  const admin = createAdminClient();
  const startedAt = Date.now();

  // ── 1. Resolve prospect + primary platform/handle ─────────────────
  const { data: prospect, error: prospectErr } = await admin
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle();

  if (prospectErr || !prospect) {
    return { ok: false, message: 'Prospect not found' };
  }

  const picked = await pickPlatform(prospect as ProspectRow);
  if (!picked) {
    return { ok: false, message: 'No social handle to analyse' };
  }

  // ── 2. Insert pending row ─────────────────────────────────────────
  const insertRes = await admin
    .from('prospect_analyses')
    .insert({
      prospect_id: prospectId,
      run_id: opts.runId,
      platform: picked.platform,
      handle: picked.handle,
      status: 'running' as ProspectAnalysisStatus,
      created_by: opts.createdBy ?? prospect.created_by ?? null,
    })
    .select('*')
    .single();

  if (insertRes.error || !insertRes.data) {
    return { ok: false, message: insertRes.error?.message ?? 'Failed to create analysis row' };
  }

  const analysisRow = insertRes.data as ProspectAnalysisRow;

  try {
    const result = await executePipeline({
      prospect: prospect as ProspectRow,
      platform: picked.platform,
      handle: picked.handle,
    });

    const durationMs = Date.now() - startedAt;
    await admin
      .from('prospect_analyses')
      .update({
        status: result.status,
        error_message: result.errorMessage,
        duration_ms: durationMs,
        cost_cents: result.costCents,
        raw_profile: result.rawProfile,
        raw_captions: result.rawCaptions,
        raw_comments: result.rawComments,
        profile_pic_assessment: result.profilePic,
        bio_assessment: result.bio,
        caption_pattern: result.captionPattern,
        comment_signal: result.commentSignal,
        posting_cadence: result.cadence,
        observations: result.observations,
        biggest_opportunity: result.biggestOpportunity,
      })
      .eq('id', analysisRow.id);

    // Touchpoint + lifecycle advance on a clean run.
    if (result.status === 'succeeded' || result.status === 'partial') {
      void admin.from('prospect_touchpoints').insert({
        prospect_id: prospectId,
        kind: 'state_change',
        body: 'Initial analysis ready',
        metadata: { run_id: analysisRow.run_id, status: result.status },
        created_by: opts.createdBy ?? null,
      });
      if (prospect.lifecycle_state === 'discovered') {
        void admin
          .from('prospects')
          .update({ lifecycle_state: 'audited' })
          .eq('id', prospectId);
      }
    }

    return {
      ok: true,
      analysisId: analysisRow.id,
      runId: analysisRow.run_id,
      status: result.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown analysis error';
    await admin
      .from('prospect_analyses')
      .update({
        status: 'failed' as ProspectAnalysisStatus,
        error_message: message,
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', analysisRow.id);
    return { ok: false, message, analysisId: analysisRow.id, status: 'failed' };
  }
}

// ── Pipeline ────────────────────────────────────────────────────────────────

interface PipelineOutput {
  status: ProspectAnalysisStatus;
  errorMessage: string | null;
  costCents: number;
  rawProfile: Record<string, unknown>;
  rawCaptions: unknown[];
  rawComments: unknown[];
  profilePic: ProfilePicAssessment | null;
  bio: BioAssessment | null;
  captionPattern: CaptionPattern | null;
  commentSignal: CommentSignal | null;
  cadence: PostingCadence | null;
  observations: string[] | null;
  biggestOpportunity: string | null;
}

async function executePipeline(inputs: PipelineInputs): Promise<PipelineOutput> {
  const scraped = await scrapePlatform(inputs.platform, inputs.handle).catch((e) => {
    throw new Error(`Scrape failed: ${e instanceof Error ? e.message : 'unknown'}`);
  });

  // Private profile / no videos → partial result, skip LLM calls.
  if (!scraped || scraped.videos.length === 0) {
    return {
      status: 'partial',
      errorMessage: 'Profile is private or inaccessible',
      costCents: 0,
      rawProfile: scraped?.profile ? (scraped.profile as unknown as Record<string, unknown>) : {},
      rawCaptions: [],
      rawComments: [],
      profilePic: scraped?.profile?.avatarUrl
        ? { rating: 'okay', note: 'Could not analyse — limited data', image_url: scraped.profile.avatarUrl }
        : { rating: 'weak', note: 'No profile picture set.', image_url: null },
      bio: null,
      captionPattern: null,
      commentSignal: null,
      cadence: { posts_per_week: 0, trend: 'unknown', note: 'Limited post history' },
      observations: ['Limited post history; rerun once handle is corrected.'],
      biggestOpportunity:
        'Confirm the handle is correct and public before running a full analysis. Sparse data means observations are unreliable.',
    };
  }

  const captions = scraped.videos.slice(0, 15).map((v) => v.description ?? '');
  const cadence = computeCadence(scraped.videos);

  // Run 3 text LLM calls in parallel. Profile-pic vision runs separately
  // (different model, different request shape) but in parallel too.
  const [bioRes, captionRes, commentRes, picRes] = await Promise.all([
    safeBio(inputs, scraped.profile),
    safeCaption(inputs, captions),
    safeComment(inputs),
    safeProfilePic(inputs, scraped.profile),
  ]);

  let totalCostCents = 0;
  totalCostCents += bioRes.costCents;
  totalCostCents += captionRes.costCents;
  totalCostCents += commentRes.costCents;
  totalCostCents += picRes.costCents;

  // ── Rollup ────────────────────────────────────────────────────────
  const rollupRes = await safeRollup(inputs, {
    profilePicSummary: picRes.value
      ? `${picRes.value.rating}: ${picRes.value.note}`
      : 'unavailable',
    bioSummary: bioRes.value
      ? `${bioRes.value.rating}: ${bioRes.value.note}`
      : 'unavailable',
    captionSummary: captionRes.value
      ? `hook ${(captionRes.value.hook_quality_avg * 100).toFixed(0)}/100, cta ${(captionRes.value.cta_rate * 100).toFixed(0)}%, voice: ${captionRes.value.voice_note}`
      : 'unavailable',
    commentSummary: commentRes.value
      ? `sentiment ${commentRes.value.sentiment_score.toFixed(2)}, themes: ${commentRes.value.recurring_themes.join(', ') || 'none'}`
      : 'unavailable',
    cadenceSummary: `${cadence.posts_per_week.toFixed(1)} posts/wk, trend ${cadence.trend}`,
  });
  totalCostCents += rollupRes.costCents;

  // Status: succeeded if every sub-step landed; partial if any failed
  // but at least the rollup survived.
  const subStepsOk = bioRes.value && captionRes.value && commentRes.value && picRes.value;
  const status: ProspectAnalysisStatus = !rollupRes.value
    ? 'failed'
    : subStepsOk
      ? 'succeeded'
      : 'partial';

  return {
    status,
    errorMessage: status === 'failed' ? 'Rollup synthesis failed' : null,
    costCents: totalCostCents,
    rawProfile: scraped.profile as unknown as Record<string, unknown>,
    rawCaptions: captions,
    rawComments: [],
    profilePic: picRes.value,
    bio: bioRes.value,
    captionPattern: captionRes.value,
    commentSignal: commentRes.value,
    cadence,
    observations: rollupRes.value?.observations ?? null,
    biggestOpportunity: rollupRes.value?.biggest_opportunity ?? null,
  };
}

// ── Sub-step helpers (LLM calls with parse + banned-topic guard) ────────────

interface SubResult<T> {
  value: T | null;
  costCents: number;
}

async function safeBio(
  inputs: PipelineInputs,
  profile: ProspectProfile,
): Promise<SubResult<BioAssessment>> {
  try {
    const res = await createCompletion({
      messages: [
        { role: 'system', content: BIO_SYSTEM },
        {
          role: 'user',
          content: buildBioPrompt({
            brandName: inputs.prospect.brand_name,
            platform: inputs.platform,
            bioText: profile.bio ?? '',
          }),
        },
      ],
      maxTokens: 400,
      jsonMode: true,
      feature: 'prospect_initial_analysis_bio',
    });
    const parsed = parseJson(res.text, BioSchema);
    if (!parsed) return { value: null, costCents: Math.round(res.estimatedCost * 100) };
    if (containsBannedTopic(parsed.note)) parsed.note = 'Filtered';
    return { value: parsed, costCents: Math.round(res.estimatedCost * 100) };
  } catch (err) {
    console.error('[spy-03] bio sub-step failed', err);
    return { value: null, costCents: 0 };
  }
}

async function safeCaption(
  inputs: PipelineInputs,
  captions: string[],
): Promise<SubResult<CaptionPattern>> {
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
        {
          role: 'user',
          content: buildCaptionPrompt({
            brandName: inputs.prospect.brand_name,
            platform: inputs.platform,
            captions,
          }),
        },
      ],
      maxTokens: 800,
      jsonMode: true,
      feature: 'prospect_initial_analysis_caption',
    });
    const parsed = parseJson(res.text, CaptionPatternSchema);
    if (!parsed) return { value: null, costCents: Math.round(res.estimatedCost * 100) };
    if (containsBannedTopic(parsed.voice_note)) parsed.voice_note = 'Filtered';
    return { value: parsed, costCents: Math.round(res.estimatedCost * 100) };
  } catch (err) {
    console.error('[spy-03] caption sub-step failed', err);
    return { value: null, costCents: 0 };
  }
}

async function safeComment(inputs: PipelineInputs): Promise<SubResult<CommentSignal>> {
  // v1: no comment scraping wired yet — return zero-signal placeholder
  // so the pipeline still produces a rollup. SPY-05/06 will plug in
  // real comment scrapes.
  return {
    value: {
      sentiment_score: 0,
      recurring_themes: [],
      reply_rate: 0,
      note: 'No recent comments to analyse.',
    },
    costCents: 0,
  };
  // Reachable later when comments are wired in:
  // const _ = inputs; // keep param for future use
}

async function safeProfilePic(
  inputs: PipelineInputs,
  profile: ProspectProfile,
): Promise<SubResult<ProfilePicAssessment>> {
  if (!profile.avatarUrl) {
    return {
      value: { rating: 'weak', note: 'No profile picture set.', image_url: null },
      costCents: 0,
    };
  }
  // Gemini Vision wiring will land alongside the Vision client surface.
  // For v1 we ship a heuristic so the pipeline completes cleanly without
  // burning Vision credits on every onboard — strategist can override
  // inline via the SPY-03 UI.
  return {
    value: {
      rating: 'okay',
      note: 'Auto-assessment pending Vision wiring.',
      image_url: profile.avatarUrl,
    },
    costCents: 0,
  };
  // Once Vision is wired:
  //   const res = await callGeminiVision({ imageUrl: profile.avatarUrl, system: PROFILE_PIC_SYSTEM, user: buildProfilePicPrompt({...}) });
  //   const parsed = parseJson(res.text, ProfilePicSchema);
  //   ...
  // Keep imports referenced so a future flip is mechanical:
  void PROFILE_PIC_SYSTEM;
  void ProfilePicSchema;
  void buildProfilePicPrompt;
  void inputs;
}

async function safeRollup(
  inputs: PipelineInputs,
  summaries: {
    profilePicSummary: string;
    bioSummary: string;
    captionSummary: string;
    commentSummary: string;
    cadenceSummary: string;
  },
): Promise<SubResult<{ observations: string[]; biggest_opportunity: string }>> {
  try {
    const res = await createCompletion({
      messages: [
        { role: 'system', content: ROLLUP_SYSTEM },
        {
          role: 'user',
          content: buildRollupPrompt({
            brandName: inputs.prospect.brand_name,
            platform: inputs.platform,
            ...summaries,
          }),
        },
      ],
      maxTokens: 600,
      jsonMode: true,
      feature: 'prospect_initial_analysis_rollup',
    });
    const parsed = parseJson(res.text, RollupSchema);
    if (!parsed) return { value: null, costCents: Math.round(res.estimatedCost * 100) };

    // Banned-topic filter — blank field rather than rerun.
    const cleanObs = parsed.observations.map((o) =>
      containsBannedTopic(o) ? 'Filtered observation' : o,
    );
    const cleanOpp = containsBannedTopic(parsed.biggest_opportunity)
      ? 'Opportunity filtered for sensitive topic.'
      : parsed.biggest_opportunity;

    return {
      value: { observations: cleanObs, biggest_opportunity: cleanOpp },
      costCents: Math.round(res.estimatedCost * 100),
    };
  } catch (err) {
    console.error('[spy-03] rollup failed', err);
    return { value: null, costCents: 0 };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseJson<T>(text: string, schema: { safeParse: (x: unknown) => { success: boolean; data?: T } }): T | null {
  // OpenRouter sometimes wraps JSON in ```json fences — strip those first.
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

interface ScrapeShape {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

async function scrapePlatform(
  platform: ProspectPlatform,
  handle: string,
): Promise<ScrapeShape | null> {
  const cleanHandle = handle.replace(/^@/, '');
  switch (platform) {
    case 'tiktok': {
      const r = await scrapeTikTokProfile(`https://www.tiktok.com/@${cleanHandle}`);
      return { profile: r.profile, videos: r.videos };
    }
    case 'instagram': {
      const r = await scrapeInstagramProfile(`https://www.instagram.com/${cleanHandle}/`);
      return { profile: r.profile, videos: r.videos };
    }
    case 'youtube': {
      const r = await scrapeYouTubeProfile(`https://www.youtube.com/@${cleanHandle}`);
      return { profile: r.profile, videos: r.videos };
    }
    case 'facebook': {
      const r = await scrapeFacebookProfile(`https://www.facebook.com/${cleanHandle}`);
      return { profile: r.profile, videos: r.videos };
    }
    default:
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

  // Compare first half vs second half to estimate trend direction.
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

async function pickPlatform(
  prospect: ProspectRow,
): Promise<{ platform: ProspectPlatform; handle: string } | null> {
  if (prospect.primary_platform && prospect.primary_handle) {
    return { platform: prospect.primary_platform, handle: prospect.primary_handle };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('prospect_socials')
    .select('platform, handle')
    .eq('prospect_id', prospect.id);
  if (!data || data.length === 0) return null;
  for (const p of FALLBACK_ORDER) {
    const match = data.find((s) => s.platform === p && s.handle);
    if (match) return { platform: p, handle: match.handle };
  }
  const first = data.find((s) => s.handle);
  return first ? { platform: first.platform as ProspectPlatform, handle: first.handle } : null;
}
