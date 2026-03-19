import { logUsage, calculateCost } from './usage';
import { checkCostBudget } from './cost-guard';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AICompletionResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number;
  /** The model that actually handled the request (may differ from primary if fallback was used) */
  modelUsed: string;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  messages: OpenRouterMessage[];
  maxTokens: number;
  webSearch?: boolean;
  webSearchMaxResults?: number;
  /** Feature name for usage tracking (e.g. 'idea_generation', 'script_generation') */
  feature?: string;
  /** User context for per-user usage tracking */
  userId?: string;
  userEmail?: string;
}

// Pricing for openrouter/hunter-alpha (currently free)
const PRICE_PER_INPUT_TOKEN = 0;
const PRICE_PER_OUTPUT_TOKEN = 0;

// ── Model cache (5-minute TTL) ──────────────────────────────────────────────
let cachedModel: string | null = null;
let cachedFallbacks: string[] | null = null;
let cachedModelAt = 0;
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the active AI model and fallback chain from agency_settings, with in-memory cache.
 */
export async function getActiveModel(): Promise<{ primary: string; fallbacks: string[] }> {
  const now = Date.now();
  if (cachedModel && now - cachedModelAt < MODEL_CACHE_TTL) {
    return { primary: cachedModel, fallbacks: cachedFallbacks ?? [] };
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('agency_settings')
      .select('ai_model, ai_fallback_models')
      .eq('agency', 'nativz')
      .single();

    if (data?.ai_model) {
      cachedModel = data.ai_model;
      cachedFallbacks = Array.isArray(data.ai_fallback_models) ? data.ai_fallback_models : [];
      cachedModelAt = now;
      return { primary: data.ai_model, fallbacks: cachedFallbacks };
    }
  } catch (err) {
    console.error('Failed to fetch active model from DB, using fallback:', err);
  }

  const fallback = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku';
  cachedModel = fallback;
  cachedFallbacks = [];
  cachedModelAt = now;
  return { primary: fallback, fallbacks: [] };
}

/** Clear the model cache (used after settings update) */
export function clearModelCache() {
  cachedModel = null;
  cachedFallbacks = null;
  cachedModelAt = 0;
}

async function callOpenRouter(
  model: string,
  options: CompletionOptions,
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    messages: options.messages,
  };

  if (options.webSearch) {
    body.plugins = [{
      id: 'web',
      max_results: options.webSearchMaxResults ?? 10,
    }];
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Nativz Cortex',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Add credits at openrouter.ai/settings/credits');
    }
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json();
  return { data, response };
}

export async function createCompletion(options: CompletionOptions): Promise<AICompletionResponse> {
  const { primary, fallbacks } = await getActiveModel();

  // Check cost budget before making the AI call
  if (options.feature) {
    const budget = await checkCostBudget(options.feature);
    if (!budget.allowed) {
      const detail = budget.featureLimit && budget.featureSpent !== undefined
        ? ` (feature "${options.feature}": $${budget.featureSpent.toFixed(2)}/$${budget.featureLimit.toFixed(2)})`
        : ` (total: $${budget.spent.toFixed(2)}/$${budget.limit.toFixed(2)})`;
      throw new Error(`AI budget exceeded for this month${detail}. Contact admin.`);
    }
  }

  // Try primary model, then each fallback in order
  const modelsToTry = [primary, ...fallbacks];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const { data } = await callOpenRouter(model, options);

      if (!data.choices || (data.choices as unknown[]).length === 0) {
        console.error(`Model ${model} returned no choices:`, JSON.stringify(data).substring(0, 500));
        throw new Error('AI model returned no response. It may be overloaded.');
      }

      const content = (data.choices as { message?: { content?: string } }[])[0]?.message?.content || '';
      if (!content) {
        console.error(`Model ${model} returned empty content`);
        throw new Error('AI model returned an empty response.');
      }

      const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      const promptTokens = usage?.prompt_tokens || 0;
      const completionTokens = usage?.completion_tokens || 0;
      const estimatedCost = promptTokens * PRICE_PER_INPUT_TOKEN + completionTokens * PRICE_PER_OUTPUT_TOKEN;

      // Log usage (non-blocking)
      if (options.feature) {
        logUsage({
          service: 'openrouter',
          model,
          feature: options.feature,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd: estimatedCost,
          userId: options.userId,
          userEmail: options.userEmail,
        }).catch(() => {});
      }

      return {
        text: content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        estimatedCost,
        modelUsed: model,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry on budget/credits errors
      if (lastError.message.includes('budget exceeded') || lastError.message.includes('credits exhausted')) {
        throw lastError;
      }
      console.warn(`Model ${model} failed, ${modelsToTry.indexOf(model) < modelsToTry.length - 1 ? 'trying next fallback' : 'no more fallbacks'}:`, lastError.message);
    }
  }

  throw lastError ?? new Error('All AI models failed. Try again later.');
}
