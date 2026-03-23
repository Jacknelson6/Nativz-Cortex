import { createAdminClient } from '@/lib/supabase/admin';

// ── Pricing per token ───────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  // OpenRouter — default / free-tier completions (tracked at $0 until priced)
  'nvidia/nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
  // OpenRouter — Hunter Alpha (writing, currently free)
  'openrouter/hunter-alpha': { input: 0, output: 0 },
  // OpenRouter — Healer Alpha (multimodal, currently free)
  'openrouter/healer-alpha': { input: 0, output: 0 },
  // Legacy — Claude Sonnet 4.5 (kept for historical logs)
  'anthropic/claude-sonnet-4-5': { input: 0.003 / 1000, output: 0.015 / 1000 },
  'anthropic/claude-sonnet-4.5': { input: 0.003 / 1000, output: 0.015 / 1000 },
  // Groq — Whisper (charged per second of audio, ~$0.006/min, approximate per-token)
  'whisper-large-v3': { input: 0, output: 0 },
  'whisper-large-v3-turbo': { input: 0, output: 0 },
  // Legacy — Gemini 2.5 Flash (kept for historical logs)
  'gemini-2.5-flash-preview-05-20': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
  // Brave Search (per query, flat rate)
  'brave-search': { input: 0.005, output: 0 },
};

// Groq audio pricing: $0.006 per minute of audio
const GROQ_AUDIO_PRICE_PER_SECOND = 0.006 / 60;

export type TrackedService =
  | 'openrouter'
  | 'groq'
  | 'gemini'
  | 'brave'
  | 'apify'
  | 'cloudflare'
  | 'resend'
  | 'youtube';

export interface UsageEntry {
  service: TrackedService;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
  /** Optional user context for per-user tracking */
  userId?: string;
  userEmail?: string;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export function calculateGroqAudioCost(durationSeconds: number): number {
  return durationSeconds * GROQ_AUDIO_PRICE_PER_SECOND;
}

/**
 * Log API usage to the database. Non-blocking — failures are swallowed.
 */
export async function logUsage(entry: UsageEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('api_usage_logs').insert({
      service: entry.service,
      model: entry.model,
      feature: entry.feature,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      total_tokens: entry.totalTokens,
      cost_usd: entry.costUsd,
      metadata: entry.metadata ?? {},
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
    });
  } catch (err) {
    console.error('Failed to log API usage:', err);
  }
}

/**
 * Get usage summary for a date range.
 */
export async function getUsageSummary(
  from: string,
  to: string,
): Promise<{
  byService: Record<string, { totalTokens: number; costUsd: number; requests: number }>;
  byModel: Record<string, { service: string; totalTokens: number; costUsd: number; requests: number }>;
  byFeature: Record<string, { model: string; totalTokens: number; costUsd: number; requests: number }>;
  byUser: Record<string, { email: string; totalTokens: number; costUsd: number; requests: number }>;
  total: { totalTokens: number; costUsd: number; requests: number };
  daily: { date: string; costUsd: number; requests: number }[];
}> {
  const admin = createAdminClient();

  const { data: logs } = await admin
    .from('api_usage_logs')
    .select('service, model, feature, total_tokens, cost_usd, created_at, user_id, user_email')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true });

  const entries = logs ?? [];

  const byService: Record<string, { totalTokens: number; costUsd: number; requests: number }> = {};
  const byModel: Record<string, { service: string; totalTokens: number; costUsd: number; requests: number }> = {};
  const byFeature: Record<string, { model: string; totalTokens: number; costUsd: number; requests: number }> = {};
  const byUser: Record<string, { email: string; totalTokens: number; costUsd: number; requests: number }> = {};
  const dailyMap: Record<string, { costUsd: number; requests: number }> = {};
  let totalTokens = 0;
  let totalCost = 0;

  for (const log of entries) {
    const cost = Number(log.cost_usd) || 0;
    const tokens = log.total_tokens || 0;

    // By service
    if (!byService[log.service]) byService[log.service] = { totalTokens: 0, costUsd: 0, requests: 0 };
    byService[log.service].totalTokens += tokens;
    byService[log.service].costUsd += cost;
    byService[log.service].requests += 1;

    // By model
    const modelKey = log.model || 'unknown';
    if (!byModel[modelKey]) byModel[modelKey] = { service: log.service, totalTokens: 0, costUsd: 0, requests: 0 };
    byModel[modelKey].totalTokens += tokens;
    byModel[modelKey].costUsd += cost;
    byModel[modelKey].requests += 1;

    // By feature (track primary model used)
    if (!byFeature[log.feature]) byFeature[log.feature] = { model: modelKey, totalTokens: 0, costUsd: 0, requests: 0 };
    byFeature[log.feature].totalTokens += tokens;
    byFeature[log.feature].costUsd += cost;
    byFeature[log.feature].requests += 1;
    // Keep the most-used model for this feature (last seen is fine for display)
    byFeature[log.feature].model = modelKey;

    // By user
    const userKey = log.user_id ?? 'system';
    if (!byUser[userKey]) byUser[userKey] = { email: log.user_email ?? 'System', totalTokens: 0, costUsd: 0, requests: 0 };
    byUser[userKey].totalTokens += tokens;
    byUser[userKey].costUsd += cost;
    byUser[userKey].requests += 1;

    // Daily
    const day = log.created_at.split('T')[0];
    if (!dailyMap[day]) dailyMap[day] = { costUsd: 0, requests: 0 };
    dailyMap[day].costUsd += cost;
    dailyMap[day].requests += 1;

    totalTokens += tokens;
    totalCost += cost;
  }

  const daily = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

  return {
    byService,
    byModel,
    byFeature,
    byUser,
    total: { totalTokens, costUsd: totalCost, requests: entries.length },
    daily,
  };
}
