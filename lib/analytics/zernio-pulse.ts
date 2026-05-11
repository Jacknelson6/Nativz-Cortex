// ZNA-03: daily analytics pulse generator.
// Reads the signal report, calls OpenRouter (Claude Sonnet 4.5) with a
// strict JSON-object response format, validates schema + banned topics +
// sentence count, retries once, and upserts client_analytics_pulses.

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';
import type {
  HighConfidencePost,
  PulsePlatform,
  SignalReport,
} from '@/lib/analytics/zernio-pulse-signal';

export const PROMPT_VERSION = 'zna-pulse-v1';
export const MODEL = 'anthropic/claude-sonnet-4.5';

export interface PulseInput {
  client_id: string;
  client_name: string;
  organization_id: string;
  pulse_date: string; // YYYY-MM-DD UTC
  signal_report: SignalReport;
  high_confidence_posts: HighConfidencePost[];
}

export interface PulseGenerationResult {
  status:
    | 'persisted'
    | 'gated_out'
    | 'dropped_banned'
    | 'dropped_sentence_count'
    | 'dropped_schema'
    | 'llm_error';
  pulse_id?: string;
  body?: string;
  signal_metric?: string;
  signal_value?: number | null;
  latency_ms: number;
}

export const PulseOutputSchema = z.object({
  body: z.string().min(10).max(800),
  signal_metric: z.enum([
    'followers',
    'views_rolling_7d',
    'engagements_rolling_7d',
    'trend_reversal',
    'cross_platform',
  ]),
  signal_value: z.number().nullable(),
  platforms_referenced: z.array(z.enum(['tiktok', 'instagram', 'facebook', 'youtube'])).max(4),
  referenced_post_ids: z.array(z.string().uuid()).max(3),
});

export type PulseOutput = z.infer<typeof PulseOutputSchema>;

export const BANNED_PATTERNS: RegExp[] = [
  /\b(posting\s+time|best\s+time\s+to\s+post|optimal\s+posting)\b/i,
  /\b(best\s+day|day\s+of\s+the\s+week\s+to\s+post|weekday\s+vs\s+weekend)\b/i,
  /\b(post\s+consistently|posting\s+frequency|post\s+more\s+often|cadence)\b/i,
  /\b(engage\s+with\s+your\s+audience|engagement\s+is\s+key|build\s+community)\b/i,
  /\b(leverage\s+trends|ride\s+trends|go\s+viral|virality|trending\s+sounds)\b/i,
  /\b(create\s+more\s+content|content\s+is\s+king|content\s+calendar)\b/i,
  /\b(beat\s+the\s+algorithm|gaming\s+the\s+algorithm|algorithm\s+tip)\b/i,
  /\b(keep\s+up\s+the\s+good\s+work|great\s+progress|nice\s+work)\b/i,
  /[—–]/, // em + en dash, hard ban
];

export function countSentences(body: string): number {
  return body
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter(Boolean).length;
}

export function findBannedMatch(body: string): RegExp | null {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(body)) return pattern;
  }
  return null;
}

const SYSTEM_PROMPT = `You write daily analytics pulses for a social-content agency's clients.

You will receive a structured signal report covering the client's last 14 days
of platform metrics: followers, rolling 7-day views, rolling 7-day engagements,
per-platform week-over-week deltas, and any high-confidence posts that drove a
delta.

You return a short, surgical, plain-English pulse that points at the SINGLE most
important trend or delta. Cross-platform synthesis is welcome when more than one
platform has signal.

HARD RULES:
1. Maximum 4 sentences in the "body" field. Count again before responding.
2. No banned topics (listed below). If you find yourself drifting into one,
   rewrite the sentence around the actual data.
3. No platitudes, no generic advice, no "consider," no "you might want to."
   State what is happening.
4. Refer to platforms by their proper names: TikTok, Instagram, YouTube,
   Facebook. Sentence case for everything else.
5. Numbers are facts; quote them. Use percentage signs for deltas. Round to one
   decimal.
6. Never reference posting times, best posting days, optimal cadence, time of
   day, weekday vs weekend, "engage with audience," "post consistently,"
   "leverage trends," "go viral," "engagement is key," or "create more content."
7. No em dash, no en dash. Use commas, periods, colons, or parentheses.

BANNED TOPICS (these strings or paraphrases of them must NEVER appear):
- posting time, posting times, best time to post, optimal posting time
- best day, best days of the week, day of the week to post
- post consistently, posting frequency, post more often, cadence
- engage with your audience, engagement is key, build community
- leverage trends, ride trends, go viral, virality, trending sounds
- create more content, content is king, content calendar advice
- algorithm tips, beat the algorithm, gaming the algorithm
- generic platitudes like "keep up the good work" or "great progress"

You output JSON matching exactly this schema:
{
  "body": string,
  "signal_metric": "followers" | "views_rolling_7d" | "engagements_rolling_7d" | "trend_reversal" | "cross_platform",
  "signal_value": number | null,
  "platforms_referenced": ("tiktok"|"instagram"|"facebook"|"youtube")[],
  "referenced_post_ids": string[]
}`;

function buildUserPrompt(input: PulseInput, retry: boolean): string {
  const base = `Client: ${input.client_name}
Pulse date (UTC): ${input.pulse_date}

Last 14 days signal report:
${JSON.stringify(input.signal_report, null, 2)}

High-confidence posts (last 7 days, >2x 30-day average views):
${JSON.stringify(input.high_confidence_posts, null, 2)}

Return the JSON object now.`;
  if (!retry) return base;
  return `${base}\n\nRETRY: previous output failed validation, try again, shorter and on-topic.`;
}

async function callLLM(input: PulseInput, retry: boolean): Promise<{
  raw: string;
  promptTokens: number;
  completionTokens: number;
  modelUsed: string;
}> {
  const userPrompt = buildUserPrompt(input, retry);
  const result = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 400,
    feature: 'zna-pulse',
    modelPreference: [MODEL],
    jsonMode: true,
  });
  return {
    raw: result.text,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    modelUsed: result.modelUsed,
  };
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models leak text before/after the JSON. Try to extract the first {...} block.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

type ValidatedAttempt =
  | { ok: true; output: PulseOutput; promptTokens: number; completionTokens: number; modelUsed: string }
  | { ok: false; reason: 'dropped_schema' | 'dropped_banned' | 'dropped_sentence_count' | 'llm_error' };

async function attempt(input: PulseInput, retry: boolean): Promise<ValidatedAttempt> {
  let raw: string;
  let promptTokens = 0;
  let completionTokens = 0;
  let modelUsed = MODEL;
  try {
    const r = await callLLM(input, retry);
    raw = r.raw;
    promptTokens = r.promptTokens;
    completionTokens = r.completionTokens;
    modelUsed = r.modelUsed;
  } catch (err) {
    console.error('[zna-pulse] llm_error', { client_id: input.client_id, error: String(err) });
    return { ok: false, reason: 'llm_error' };
  }

  const parsed = parseJsonSafe(raw);
  if (!parsed) return { ok: false, reason: 'dropped_schema' };
  const validation = PulseOutputSchema.safeParse(parsed);
  if (!validation.success) {
    console.warn('[zna-pulse] dropped_schema', {
      client_id: input.client_id,
      issues: validation.error.issues,
    });
    return { ok: false, reason: 'dropped_schema' };
  }

  const banned = findBannedMatch(validation.data.body);
  if (banned) {
    console.warn('[zna-pulse] dropped_banned', {
      client_id: input.client_id,
      pattern: banned.toString(),
    });
    return { ok: false, reason: 'dropped_banned' };
  }

  const sentences = countSentences(validation.data.body);
  if (sentences > 4) {
    console.warn('[zna-pulse] dropped_sentence_count', {
      client_id: input.client_id,
      sentences,
    });
    return { ok: false, reason: 'dropped_sentence_count' };
  }

  return { ok: true, output: validation.data, promptTokens, completionTokens, modelUsed };
}

/**
 * Cross-platform check: when 2+ platforms each contributed at least one
 * triggered gate, the headline metric is 'cross_platform' regardless of
 * which single metric the model picked.
 */
function isCrossPlatform(report: SignalReport): boolean {
  const platforms = new Set<PulsePlatform | 'cross_platform'>(
    report.triggered_gates.map((g) => g.platform),
  );
  platforms.delete('cross_platform');
  return platforms.size >= 2;
}

export async function generatePulse(args: {
  supabase: SupabaseClient;
  input: PulseInput;
  isRegenerate?: boolean;
}): Promise<PulseGenerationResult> {
  const start = Date.now();
  const { supabase, input } = args;

  if (input.signal_report.triggered_gates.length === 0 && !args.isRegenerate) {
    return { status: 'gated_out', latency_ms: Date.now() - start };
  }

  const first = await attempt(input, false);
  let resolved: ValidatedAttempt = first;
  if (!first.ok && (first.reason === 'dropped_banned' || first.reason === 'dropped_sentence_count' || first.reason === 'dropped_schema')) {
    resolved = await attempt(input, true);
  }

  if (!resolved.ok) {
    return { status: resolved.reason, latency_ms: Date.now() - start };
  }

  const output = resolved.output;
  // Override signal_metric to 'cross_platform' when the data shows it.
  const finalSignalMetric = isCrossPlatform(input.signal_report) ? 'cross_platform' : output.signal_metric;
  const finalSignalValue = finalSignalMetric === 'cross_platform' || finalSignalMetric === 'trend_reversal'
    ? null
    : output.signal_value;

  // Upsert (client_id, pulse_date). ON CONFLICT clears is_dismissed only
  // when the new body differs from the existing one.
  const { data: existing } = await supabase
    .from('client_analytics_pulses')
    .select('id, body, is_dismissed')
    .eq('client_id', input.client_id)
    .eq('pulse_date', input.pulse_date)
    .maybeSingle();

  const latency_ms = Date.now() - start;

  const payload = {
    client_id: input.client_id,
    organization_id: input.organization_id,
    pulse_date: input.pulse_date,
    body: output.body,
    signal_metric: finalSignalMetric,
    signal_value: finalSignalValue,
    platforms_referenced: output.platforms_referenced,
    referenced_post_ids: output.referenced_post_ids,
    model: resolved.modelUsed,
    prompt_version: PROMPT_VERSION,
    input_tokens: resolved.promptTokens,
    output_tokens: resolved.completionTokens,
    latency_ms,
    flagged_wrong_at: null,
    flagged_wrong_by: null,
    flagged_wrong_reason: null,
  };

  if (existing) {
    const bodyChanged = existing.body !== output.body;
    const { data: updated, error } = await supabase
      .from('client_analytics_pulses')
      .update({
        ...payload,
        // Only clear dismissal when the body actually changes.
        is_dismissed: bodyChanged ? false : existing.is_dismissed,
        dismissed_at: bodyChanged ? null : undefined,
        dismissed_by: bodyChanged ? null : undefined,
        generated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) {
      console.error('[zna-pulse] persist_error', { client_id: input.client_id, error });
      return { status: 'llm_error', latency_ms };
    }
    return {
      status: 'persisted',
      pulse_id: updated?.id,
      body: output.body,
      signal_metric: finalSignalMetric,
      signal_value: finalSignalValue,
      latency_ms,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('client_analytics_pulses')
    .insert(payload)
    .select('id')
    .single();

  if (insertError) {
    console.error('[zna-pulse] persist_error', { client_id: input.client_id, error: insertError });
    return { status: 'llm_error', latency_ms };
  }

  return {
    status: 'persisted',
    pulse_id: inserted?.id,
    body: output.body,
    signal_metric: finalSignalMetric,
    signal_value: finalSignalValue,
    latency_ms,
  };
}
