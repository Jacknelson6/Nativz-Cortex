import { calculateCost, logUsage } from './usage';
import { checkCostBudget } from './cost-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from './openrouter-default-model';
import { resolveOpenRouterApiKeyForFeature, resolveDashscopeApiKeyForFeature } from './provider-keys';
import {
  extractOpenRouterWebCitations,
  extractUrlsFromPlainText,
  type WebCitationHit,
} from './openrouter-citations';

export type { WebCitationHit } from './openrouter-citations';

export interface AICompletionResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number;
  /** The model that actually handled the request */
  modelUsed: string;
  webCitations?: WebCitationHit[];
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
  timeoutMs?: number;
  feature?: string;
  userId?: string;
  userEmail?: string;
  /** Override model for this call only. Otherwise uses the single DB-configured model. */
  modelPreference?: string[];
  jsonMode?: boolean;
}

// ── Model cache (5-minute TTL) ──────────────────────────────────────────────
let cachedModel: string | null = null;
let cachedModelAt = 0;
const MODEL_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get the single active AI model from agency_settings.
 * No fallback chains — one model for everything, switchable from admin dashboard.
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
    console.error('Failed to fetch active model from DB, using default:', err);
  }

  const fallback = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  cachedModel = fallback;
  cachedModelAt = now;
  return fallback;
}

/** Clear the model cache (used after settings update) */
export function clearModelCache() {
  cachedModel = null;
  cachedModelAt = 0;
}

async function callOpenRouter(
  model: string,
  options: CompletionOptions,
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const apiKey = await resolveOpenRouterApiKeyForFeature(options.feature);
  if (!apiKey) throw new Error('OpenRouter API key is not configured (add OPENROUTER_API_KEY or set keys in admin → AI models)');

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

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const timeoutMs = options.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Nativz Cortex',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'));
    if (aborted) {
      throw new Error(
        `OpenRouter request timed out after ${timeoutMs}ms. Try again or switch model in admin settings.`,
      );
    }
    throw err;
  }
  if (timeoutId) clearTimeout(timeoutId);

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

async function callDashscope(
  model: string,
  options: CompletionOptions,
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const apiKey = resolveDashscopeApiKeyForFeature(options.feature);
  if (!apiKey) throw new Error('Dashscope API key is not configured (add DASHSCOPE_API_KEY)');

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    messages: options.messages,
  };

  const timeoutMs = options.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch('https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'));
    if (aborted) {
      throw new Error(`Dashscope request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  }
  if (timeoutId) clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dashscope API error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json();
  return { data, response };
}

function buildCompletionResult(
  data: Record<string, unknown>,
  model: string,
  options: CompletionOptions,
): AICompletionResponse {
  if (!data.choices || (data.choices as unknown[]).length === 0) {
    console.error(`Model ${model} returned no choices:`, JSON.stringify(data).substring(0, 500));
    throw new Error('AI model returned no response. It may be overloaded.');
  }

  const rawContent = (data.choices as { message?: { content?: string | null } }[])[0]?.message?.content;
  const content = typeof rawContent === 'string' ? rawContent : '';
  const maxCit = options.webSearchMaxResults ?? 10;
  const fromAnnotations = extractOpenRouterWebCitations(data);
  let webCitations: WebCitationHit[] = fromAnnotations;
  if (options.webSearch && fromAnnotations.length === 0 && content) {
    webCitations = extractUrlsFromPlainText(content, maxCit);
  }

  const hasWebEvidence = options.webSearch && webCitations.length > 0;
  if (!content && !hasWebEvidence) {
    console.error(`Model ${model} returned empty content`);
    throw new Error('AI model returned an empty response.');
  }

  const service = model.startsWith('dashscope/') ? 'dashscope' : model.startsWith('openai/') ? 'openai' : 'openrouter';
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const estimatedCost = calculateCost(model, promptTokens, completionTokens);

  if (options.feature) {
    // OpenRouter responses include a top-level `id`; stamping it into
    // metadata lets the generation webhook locate this row later and
    // overwrite cost_usd with post-billing truth instead of inserting a
    // duplicate. Other services (openai direct, dashscope) don't send a
    // usable id here, so we skip the stamp for them.
    const rawId = typeof data.id === 'string' ? data.id.trim() : '';
    const generationId = service === 'openrouter' && rawId ? rawId : null;
    logUsage({
      service,
      model,
      feature: options.feature,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: estimatedCost,
      userId: options.userId,
      userEmail: options.userEmail,
      metadata: generationId ? { openrouter_generation_id: generationId } : undefined,
    }).catch(() => {});
  }

  return {
    text: content,
    webCitations: webCitations.length ? webCitations : undefined,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    estimatedCost,
    modelUsed: model,
  };
}

/**
 * Simple AI completion — uses the single model set in admin dashboard.
 * If modelPreference is passed, tries that first.
 * Routes to OpenRouter, OpenAI, or Dashscope based on model prefix.
 */
export async function createCompletion(options: CompletionOptions): Promise<AICompletionResponse> {
  // Resolve the model: explicit preference > DB setting > default
  const dbModel = await getActiveModel();
  const model = options.modelPreference?.[0]?.trim() || dbModel;

  // Check cost budget
  if (options.feature) {
    const budget = await checkCostBudget(options.feature);
    if (!budget.allowed) {
      const detail = budget.featureLimit && budget.featureSpent !== undefined
        ? ` (feature "${options.feature}": $${budget.featureSpent.toFixed(2)}/$${budget.featureLimit.toFixed(2)})`
        : ` (total: $${budget.spent.toFixed(2)}/$${budget.limit.toFixed(2)})`;
      throw new Error(`AI budget exceeded for this month${detail}. Contact admin.`);
    }
  }

  // Route to the correct provider based on model prefix
  if (model.startsWith('dashscope/')) {
    const dsModel = model.slice('dashscope/'.length);
    const { data } = await callDashscope(dsModel, options);
    return buildCompletionResult(data, model, options);
  }

  // Always route through OpenRouter — single provider for the whole pipeline.
  // OpenRouter proxies to OpenAI / Anthropic / Google / etc. based on the slug
  // prefix (`openai/…`, `anthropic/…`, …). Direct-OpenAI used to short-circuit
  // here when an `openai/…` slug coincided with a saved OpenAI key; that path
  // was removed so configuration is unambiguous.
  const { data } = await callOpenRouter(model, options);
  return buildCompletionResult(data, model, options);
}
