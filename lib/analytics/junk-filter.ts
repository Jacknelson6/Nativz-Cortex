// VFF-04: cheap two-stage gate between VFF-03 sourcing and VFF-05 analysis.
//
// Stage 1: pure heuristic on row fields (sync, no IO).
// Stage 2: LLM topical gate (caption + thumbnail + brand seeds).
//
// gateHeuristic() and gateVideo() are exported separately so unit tests can
// hit them without mocking the LLM call.

import { z } from 'zod';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import type { RejectReason } from '@/lib/analytics/reject-reasons';

const LOW_VIEWS_THRESHOLD = 10_000;
const SOFT_VIEWS_THRESHOLD = 50_000;
const MAX_DURATION_S = 90;
const MIN_DURATION_S = 5;
const MIN_ENGAGEMENT_RATE = 0.01;

export type GateVerdict = {
  pass: boolean;
  reason?: RejectReason;
  metadata: Record<string, unknown>;
};

export type GateVideoInput = {
  id?: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url?: string | null;
  caption?: string | null;
  thumbnail_storage_url?: string | null;
  thumbnail_source_url?: string | null;
  duration_seconds: number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  raw_payload?: Record<string, unknown> | null;
};

function isAdvert(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw) return false;
  if (raw.is_ad === true) return true;
  const sponsorship = raw.sponsorshipInfo;
  if (Array.isArray(sponsorship) && sponsorship.length > 0) return true;
  return false;
}

function isRepost(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw) return false;
  return raw.is_repost === true;
}

export function gateHeuristic(video: GateVideoInput): GateVerdict {
  const meta: Record<string, unknown> = {};
  const allMissing =
    video.views_count == null &&
    video.duration_seconds == null &&
    video.likes_count == null &&
    video.comments_count == null;
  if (allMissing) {
    return { pass: false, reason: 'metadata_incomplete', metadata: { ...meta, stage: 'heuristic' } };
  }
  if (isAdvert(video.raw_payload ?? null)) {
    return { pass: false, reason: 'paid_ad', metadata: { ...meta, stage: 'heuristic' } };
  }
  if (isRepost(video.raw_payload ?? null)) {
    return { pass: false, reason: 'reposted', metadata: { ...meta, stage: 'heuristic' } };
  }
  if (video.duration_seconds != null && video.duration_seconds > MAX_DURATION_S) {
    return {
      pass: false,
      reason: 'too_long',
      metadata: { ...meta, stage: 'heuristic', duration: video.duration_seconds },
    };
  }
  if (video.duration_seconds != null && video.duration_seconds < MIN_DURATION_S) {
    return {
      pass: false,
      reason: 'too_short',
      metadata: { ...meta, stage: 'heuristic', duration: video.duration_seconds },
    };
  }
  if (video.views_count != null && video.views_count < LOW_VIEWS_THRESHOLD) {
    return {
      pass: false,
      reason: 'low_views',
      metadata: { ...meta, stage: 'heuristic', views: video.views_count },
    };
  }
  const views = Math.max(video.views_count ?? 0, 1);
  const totalEng =
    (video.likes_count ?? 0) +
    (video.comments_count ?? 0) +
    (video.shares_count ?? 0);
  const engRate = totalEng / views;
  meta.engagement_rate = Number(engRate.toFixed(4));
  if (
    engRate < MIN_ENGAGEMENT_RATE &&
    (video.views_count ?? 0) < SOFT_VIEWS_THRESHOLD
  ) {
    return {
      pass: false,
      reason: 'low_engagement',
      metadata: { ...meta, stage: 'heuristic' },
    };
  }
  return { pass: true, metadata: { ...meta, stage: 'heuristic' } };
}

export const GateSchema = z.object({
  is_short_form_video: z.boolean(),
  is_on_brand: z.boolean(),
  reason: z.string().min(1).max(200),
});

const SYSTEM_PROMPT =
  'You are a binary content gate for a short-form video discovery pipeline. Decide two things: is this a real short-form video with narrative structure, and is the topic related to ANY of the provided seed terms. Output strict JSON. Sentence case in any free text. No em dashes, no en dashes.';

function buildUserPrompt(video: GateVideoInput, seedTerms: string[]): string {
  return [
    `Caption: ${(video.caption ?? '').slice(0, 800)}`,
    `Platform: ${video.platform}`,
    `Duration: ${video.duration_seconds ?? 'unknown'}s`,
    `Brand seeds (any match counts): ${seedTerms.slice(0, 25).join(', ') || '(none)'}`,
    `Thumbnail URL: ${video.thumbnail_storage_url ?? video.thumbnail_source_url ?? '(none)'}`,
    '',
    'Return JSON:',
    '{',
    '  "is_short_form_video": true | false,',
    '  "is_on_brand": true | false,',
    '  "reason": "single short sentence explaining the decision"',
    '}',
  ].join('\n');
}

async function callLlmGate(
  video: GateVideoInput,
  seedTerms: string[],
): Promise<{ verdict?: z.infer<typeof GateSchema>; error?: string }> {
  try {
    const { text } = await createOpenRouterRichCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(video, seedTerms) },
      ],
      maxTokens: 200,
      temperature: 0,
      timeoutMs: 30_000,
      feature: 'vff_junk_filter',
      modelPreference: [
        'openai/gpt-5.4-mini',
        'anthropic/claude-haiku-4',
        'anthropic/claude-haiku-4.5',
      ],
    });
    const cleaned = text
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = GateSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      return { error: 'malformed_json' };
    }
    return { verdict: parsed.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'llm_error';
    return { error: msg };
  }
}

export async function gateVideo(
  video: GateVideoInput,
  seedTerms: string[],
  priorMetadata: Record<string, unknown> = {},
): Promise<GateVerdict> {
  const heuristic = gateHeuristic(video);
  if (!heuristic.pass) return heuristic;

  const captionMissing = !(video.caption ?? '').trim();
  const thumbnailMissing =
    !video.thumbnail_storage_url && !video.thumbnail_source_url;
  if (captionMissing && thumbnailMissing) {
    return {
      pass: false,
      reason: 'metadata_incomplete',
      metadata: { stage: 'heuristic_post', ...heuristic.metadata },
    };
  }

  const { verdict, error } = await callLlmGate(video, seedTerms);
  if (error || !verdict) {
    const failures = Number(priorMetadata.llm_failures ?? 0) + 1;
    if (failures >= 3) {
      return {
        pass: false,
        reason: 'gate_error',
        metadata: {
          ...heuristic.metadata,
          stage: 'llm',
          llm_failures: failures,
          llm_last_error: error ?? 'unknown',
        },
      };
    }
    return {
      pass: false, // returned as "do not advance yet"; caller leaves status pending
      reason: undefined,
      metadata: {
        ...heuristic.metadata,
        stage: 'llm_retry',
        llm_failures: failures,
        llm_last_error: error ?? 'unknown',
      },
    };
  }

  if (!verdict.is_short_form_video) {
    return {
      pass: false,
      reason: 'not_short_form',
      metadata: {
        ...heuristic.metadata,
        stage: 'llm',
        llm_reason: verdict.reason,
      },
    };
  }
  if (!verdict.is_on_brand) {
    return {
      pass: false,
      reason: 'off_topic',
      metadata: {
        ...heuristic.metadata,
        stage: 'llm',
        llm_reason: verdict.reason,
      },
    };
  }
  return {
    pass: true,
    metadata: { ...heuristic.metadata, stage: 'llm', llm_reason: verdict.reason },
  };
}

export const __TEST__ = {
  LOW_VIEWS_THRESHOLD,
  MAX_DURATION_S,
  MIN_DURATION_S,
  MIN_ENGAGEMENT_RATE,
};
