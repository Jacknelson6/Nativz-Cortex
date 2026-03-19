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
}

// Pricing for openrouter/hunter-alpha (currently free)
const PRICE_PER_INPUT_TOKEN = 0;
const PRICE_PER_OUTPUT_TOKEN = 0;

// ── Model cache (5-minute TTL) ──────────────────────────────────────────────
let cachedModel: string | null = null;
let cachedModelAt = 0;
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the active AI model from agency_settings, with in-memory cache.
 * Falls back to OPENROUTER_MODEL env var, then to 'anthropic/claude-3.5-haiku'.
 */
export async function getActiveModel(): Promise<string> {
  const now = Date.now();
  if (cachedModel && now - cachedModelAt < MODEL_CACHE_TTL) {
    return cachedModel;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('agency_settings')
      .select('ai_model')
      .eq('agency', 'nativz')
      .single();

    if (data?.ai_model) {
      cachedModel = data.ai_model;
      cachedModelAt = now;
      return data.ai_model;
    }
  } catch (err) {
    console.error('Failed to fetch active model from DB, using fallback:', err);
  }

  const fallback = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku';
  cachedModel = fallback;
  cachedModelAt = now;
  return fallback;
}

export async function createCompletion(options: CompletionOptions): Promise<AICompletionResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = await getActiveModel();

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

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
    console.error('OpenRouter API error:', response.status, errorBody.substring(0, 500));
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Add credits at openrouter.ai/settings/credits');
    }
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json();

  if (!data.choices || data.choices.length === 0) {
    console.error('OpenRouter returned no choices:', JSON.stringify(data).substring(0, 500));
    throw new Error('AI model returned no response. It may be overloaded. Try again.');
  }

  const content = data.choices[0]?.message?.content || '';

  if (!content) {
    console.error('OpenRouter returned empty content:', JSON.stringify(data.choices[0]).substring(0, 500));
    throw new Error('AI model returned an empty response. Try again.');
  }
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
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
  };
}
