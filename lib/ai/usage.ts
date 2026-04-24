import { createAdminClient } from '@/lib/supabase/admin';

// ── Pricing per token ───────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  // OpenRouter — default / free-tier completions (tracked at $0 until priced)
  'nvidia/nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
  'qwen/qwen3.6-plus-preview:free': { input: 0, output: 0 },
  // OpenRouter — Hunter Alpha (writing, currently free)
  'openrouter/hunter-alpha': { input: 0, output: 0 },
  // OpenRouter — Healer Alpha (multimodal, currently free)
  'openrouter/healer-alpha': { input: 0, output: 0 },
  // Legacy — Claude Sonnet 4.5 (kept for historical logs)
  'anthropic/claude-sonnet-4-5': { input: 0.003 / 1000, output: 0.015 / 1000 },
  'anthropic/claude-sonnet-4.5': { input: 0.003 / 1000, output: 0.015 / 1000 },
  // OpenAI — current recommended routing targets
  'openai/gpt-5.4': { input: 2.5 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-5.4': { input: 2.5 / 1_000_000, output: 15 / 1_000_000 },
  'openai/gpt-5.4-mini': { input: 0.75 / 1_000_000, output: 4.5 / 1_000_000 },
  'gpt-5.4-mini': { input: 0.75 / 1_000_000, output: 4.5 / 1_000_000 },
  'openai/gpt-5.4-nano': { input: 0.2 / 1_000_000, output: 1.25 / 1_000_000 },
  'gpt-5.4-nano': { input: 0.2 / 1_000_000, output: 1.25 / 1_000_000 },
  // OpenRouter — low-cost smart defaults
  'deepseek/deepseek-v3.2': { input: 0.26 / 1_000_000, output: 0.38 / 1_000_000 },
  'qwen/qwen3-30b-a3b': { input: 0.08 / 1_000_000, output: 0.28 / 1_000_000 },
  'qwen/qwen3.5-27b': { input: 0.2 / 1_000_000, output: 0.6 / 1_000_000 },
  // Dashscope (Alibaba/Qwen) direct
  'dashscope/qwen3.5-flash': { input: 0.07 / 1_000_000, output: 0.26 / 1_000_000 },
  'dashscope/qwen3.5-omni-flash': { input: 0.2 / 1_000_000, output: 0.6 / 1_000_000 },
  'qwen3.5-flash': { input: 0.07 / 1_000_000, output: 0.26 / 1_000_000 },
  // Groq — Whisper (charged per second of audio, ~$0.006/min, approximate per-token)
  'whisper-large-v3': { input: 0, output: 0 },
  'whisper-large-v3-turbo': { input: 0, output: 0 },
  // Legacy — Gemini 2.5 Flash (kept for historical logs)
  'gemini-2.5-flash-preview-05-20': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
  // SearXNG (self-hosted, no per-query cost)
  'searxng': { input: 0, output: 0 },
};

// Groq audio pricing: $0.006 per minute of audio
const GROQ_AUDIO_PRICE_PER_SECOND = 0.006 / 60;

export type TrackedService =
  | 'openrouter'
  | 'openai'
  | 'dashscope'
  | 'groq'
  | 'gemini'
  | 'searxng'
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
  const key = model.trim();
  const pricing = PRICING[key];
  if (!pricing) return 0;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export function calculateGroqAudioCost(durationSeconds: number): number {
  return durationSeconds * GROQ_AUDIO_PRICE_PER_SECOND;
}

/**
 * Log API usage to the database. Non-blocking — failures are swallowed.
 *
 * Reverse-race handling (OpenRouter only):
 *
 *   When the OpenRouter webhook arrives at /api/webhooks/openrouter/generation
 *   BEFORE our local logUsage insert (possible under cold starts or long
 *   local fetches), the webhook inserts a row with `feature='reconciled'`,
 *   the real cost, and the generation id. Our subsequent insert then hits
 *   the UNIQUE partial index from migration 161 and fails with 23505.
 *   Without the branch below we'd silently drop the feature + user
 *   attribution ("which user asked what in the Nerd").
 *
 *   The recovery path: on 23505, fetch the existing row, merge our local
 *   attribution (feature, user_id, user_email, metadata) into it without
 *   touching the webhook's ground-truth cost/tokens. This happens only
 *   on the rare race; the hot path (insert succeeds) has zero extra
 *   queries.
 */
export async function logUsage(entry: UsageEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const genId =
      typeof entry.metadata?.openrouter_generation_id === 'string'
        ? (entry.metadata.openrouter_generation_id as string)
        : null;

    const insertPayload = {
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
    };

    const { error } = await admin.from('api_usage_logs').insert(insertPayload);

    // Happy path — or a non-conflict failure we want visible in logs.
    if (!error) return;
    if (!genId || error.code !== '23505') {
      console.error('Failed to log API usage:', error);
      return;
    }

    // Reverse race: webhook wrote first. Merge our local attribution onto
    // the existing row without clobbering the webhook's cost/tokens.
    const { data: existing } = await admin
      .from('api_usage_logs')
      .select('id, metadata')
      .contains('metadata', { openrouter_generation_id: genId })
      .limit(1)
      .maybeSingle();

    if (!existing?.id) {
      // Conflict but no row — transient weirdness. Surface it and move on.
      console.error('Failed to log API usage (conflict, no row found):', error);
      return;
    }

    const prevMeta =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>)
        : {};
    await admin
      .from('api_usage_logs')
      .update({
        service: entry.service,
        model: entry.model,
        feature: entry.feature,
        user_id: entry.userId ?? null,
        user_email: entry.userEmail ?? null,
        metadata: { ...prevMeta, ...(entry.metadata ?? {}) },
      })
      .eq('id', existing.id);
  } catch (err) {
    console.error('Failed to log API usage:', err);
  }
}

/**
 * Get usage summary for a date range.
 */
export interface UsageSummary {
  byService: Record<string, { totalTokens: number; costUsd: number; requests: number }>;
  byModel: Record<string, { service: string; totalTokens: number; costUsd: number; requests: number }>;
  byFeature: Record<string, { model: string; totalTokens: number; costUsd: number; requests: number }>;
  byUser: Record<string, { email: string; totalTokens: number; costUsd: number; requests: number }>;
  total: { totalTokens: number; costUsd: number; requests: number };
  daily: { date: string; costUsd: number; requests: number; totalTokens: number }[];
  /** For stacked bar charts — tokens AND cost grouped by day then by model. */
  dailyByModel: {
    date: string;
    tokensByModel: Record<string, number>;
    costByModel: Record<string, number>;
  }[];
  /** Calendar-scoped rollups (independent of the `from` window). */
  today: { totalTokens: number; costUsd: number; requests: number };
  thisMonth: { totalTokens: number; costUsd: number; requests: number };
  /**
   * Reconciliation coverage — number of logged calls whose cost has been
   * confirmed by the OpenRouter generation webhook vs. still-estimated-only.
   * A row counts as reconciled when `metadata.openrouter_generation_id` is
   * set by the webhook handler.
   */
  reconciliation: {
    reconciled: number;
    estimated: number;
    total: number;
    coveragePct: number;
    /** Sum of cost_usd on rows we've reconciled — true-billing dollars. */
    reconciledCostUsd: number;
  };
}

// ── Aggregation passes ─────────────────────────────────────────────────────
// getUsageSummary decomposes into a few small reducers over the same row
// list. Each pass is pure and independently testable, and the top-level
// function just composes them. Keeping the row fetch in one place (the
// `fetchUsageRows` helper) lets the aggregation pieces stay in-memory and
// avoids a second round-trip to Postgres.

type UsageRow = {
  service: string;
  model: string | null;
  feature: string;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  metadata: unknown;
};

async function fetchUsageRows(from: string, to: string): Promise<UsageRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('api_usage_logs')
    .select('service, model, feature, total_tokens, cost_usd, created_at, user_id, user_email, metadata')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true });
  return (data ?? []) as UsageRow[];
}

/** Row-level derived fields every aggregation pass uses. */
interface DerivedFields {
  cost: number;
  tokens: number;
  day: string;
  modelKey: string;
}

function deriveRow(row: UsageRow): DerivedFields {
  return {
    cost: Number(row.cost_usd) || 0,
    tokens: row.total_tokens || 0,
    day: row.created_at.split('T')[0],
    modelKey: row.model || 'unknown',
  };
}

type BucketTotals = { totalTokens: number; costUsd: number; requests: number };

function aggregateByService(rows: UsageRow[]): Record<string, BucketTotals> {
  const out: Record<string, BucketTotals> = {};
  for (const row of rows) {
    const { cost, tokens } = deriveRow(row);
    const bucket = (out[row.service] ??= { totalTokens: 0, costUsd: 0, requests: 0 });
    bucket.totalTokens += tokens;
    bucket.costUsd += cost;
    bucket.requests += 1;
  }
  return out;
}

function aggregateByModel(
  rows: UsageRow[],
): Record<string, { service: string } & BucketTotals> {
  const out: Record<string, { service: string } & BucketTotals> = {};
  for (const row of rows) {
    const { cost, tokens, modelKey } = deriveRow(row);
    const bucket = (out[modelKey] ??= {
      service: row.service,
      totalTokens: 0,
      costUsd: 0,
      requests: 0,
    });
    bucket.totalTokens += tokens;
    bucket.costUsd += cost;
    bucket.requests += 1;
  }
  return out;
}

/**
 * `byFeature` tracks usage per feature AND picks the dominant model per
 * feature (the model that answered the most calls for that feature in the
 * window). Two-pass so we can count model occurrences before deciding the
 * winner — doing it in one pass would be simpler but would sort-on-every-row.
 */
function aggregateByFeature(
  rows: UsageRow[],
): Record<string, { model: string } & BucketTotals> {
  const out: Record<string, { model: string } & BucketTotals> = {};
  const modelCounts: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const { cost, tokens, modelKey } = deriveRow(row);
    const bucket = (out[row.feature] ??= {
      model: modelKey,
      totalTokens: 0,
      costUsd: 0,
      requests: 0,
    });
    bucket.totalTokens += tokens;
    bucket.costUsd += cost;
    bucket.requests += 1;

    const counts = (modelCounts[row.feature] ??= {});
    counts[modelKey] = (counts[modelKey] ?? 0) + 1;
  }

  for (const [feature, counts] of Object.entries(modelCounts)) {
    const dominantModel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominantModel) out[feature].model = dominantModel;
  }
  return out;
}

function aggregateByUser(
  rows: UsageRow[],
): Record<string, { email: string } & BucketTotals> {
  const out: Record<string, { email: string } & BucketTotals> = {};
  for (const row of rows) {
    const { cost, tokens } = deriveRow(row);
    const key = row.user_id ?? 'system';
    const bucket = (out[key] ??= {
      email: row.user_email ?? 'System',
      totalTokens: 0,
      costUsd: 0,
      requests: 0,
    });
    bucket.totalTokens += tokens;
    bucket.costUsd += cost;
    bucket.requests += 1;
  }
  return out;
}

/**
 * Daily aggregates — split into two: a flat daily totals array (for cost-
 * over-time sparklines) and a per-model-per-day breakdown (for the stacked
 * bar chart). Both derived from the same single pass.
 */
function aggregateDaily(rows: UsageRow[]): {
  daily: UsageSummary['daily'];
  dailyByModel: UsageSummary['dailyByModel'];
} {
  const dailyMap: Record<string, { costUsd: number; requests: number; totalTokens: number }> = {};
  const tokensByModelMap: Record<string, Record<string, number>> = {};
  const costByModelMap: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const { cost, tokens, day, modelKey } = deriveRow(row);

    const d = (dailyMap[day] ??= { costUsd: 0, requests: 0, totalTokens: 0 });
    d.costUsd += cost;
    d.requests += 1;
    d.totalTokens += tokens;

    const tokensForDay = (tokensByModelMap[day] ??= {});
    tokensForDay[modelKey] = (tokensForDay[modelKey] ?? 0) + tokens;

    const costForDay = (costByModelMap[day] ??= {});
    costForDay[modelKey] = (costForDay[modelKey] ?? 0) + cost;
  }

  const daily = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));
  const dailyByModel = Object.entries(tokensByModelMap)
    .map(([date, tokensByModel]) => ({
      date,
      tokensByModel,
      costByModel: costByModelMap[date] ?? {},
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { daily, dailyByModel };
}

/**
 * Calendar-scoped counters — they read the SAME in-memory rows as the other
 * aggregations, but bucket by today/this-month instead of the user's from/to
 * window. That keeps "Used today" meaningful when the window is "last 7d".
 */
function aggregateCalendarRollups(rows: UsageRow[]): {
  today: BucketTotals;
  thisMonth: BucketTotals;
} {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const today: BucketTotals = { totalTokens: 0, costUsd: 0, requests: 0 };
  const thisMonth: BucketTotals = { totalTokens: 0, costUsd: 0, requests: 0 };

  for (const row of rows) {
    const { cost, tokens, day } = deriveRow(row);
    if (day === todayKey) {
      today.totalTokens += tokens;
      today.costUsd += cost;
      today.requests += 1;
    }
    if (day.startsWith(monthKey)) {
      thisMonth.totalTokens += tokens;
      thisMonth.costUsd += cost;
      thisMonth.requests += 1;
    }
  }
  return { today, thisMonth };
}

/**
 * Reconciliation coverage — how many rows carry an
 * `metadata.openrouter_generation_id`. The webhook handler stamps that
 * key on every row it writes or updates, so presence ≡ cost is
 * OpenRouter's billing truth rather than our local price-table estimate.
 */
function aggregateReconciliation(rows: UsageRow[]): UsageSummary['reconciliation'] {
  let reconciledCount = 0;
  let reconciledCost = 0;
  for (const row of rows) {
    const { cost } = deriveRow(row);
    const meta = row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null;
    if (meta && typeof meta.openrouter_generation_id === 'string' && meta.openrouter_generation_id.length > 0) {
      reconciledCount += 1;
      reconciledCost += cost;
    }
  }
  const total = rows.length;
  return {
    reconciled: reconciledCount,
    estimated: total - reconciledCount,
    total,
    coveragePct: total > 0 ? Math.round((reconciledCount / total) * 100) : 0,
    reconciledCostUsd: reconciledCost,
  };
}

function aggregateTotals(rows: UsageRow[]): BucketTotals {
  let totalTokens = 0;
  let totalCost = 0;
  for (const row of rows) {
    const { cost, tokens } = deriveRow(row);
    totalTokens += tokens;
    totalCost += cost;
  }
  return { totalTokens, costUsd: totalCost, requests: rows.length };
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function getUsageSummary(from: string, to: string): Promise<UsageSummary> {
  const rows = await fetchUsageRows(from, to);
  const { daily, dailyByModel } = aggregateDaily(rows);
  const { today, thisMonth } = aggregateCalendarRollups(rows);

  return {
    byService: aggregateByService(rows),
    byModel: aggregateByModel(rows),
    byFeature: aggregateByFeature(rows),
    byUser: aggregateByUser(rows),
    total: aggregateTotals(rows),
    daily,
    dailyByModel,
    today,
    thisMonth,
    reconciliation: aggregateReconciliation(rows),
  };
}

