import { calculateCost, logUsage } from './usage';
import { checkCostBudget } from './cost-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from './openrouter-default-model';
import { resolveOpenAiApiKeyForFeature, resolveOpenRouterApiKeyForFeature, resolveDashscopeApiKeyForFeature } from './provider-keys';
import { openAiChatCompletionTokenFields, toOpenAiChatModelId } from './openai-model-id';
import { buildOrderedModelChain, getFeatureRoutingPolicy } from './routing-policy';
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
  /** The model that actually handled the request (may differ from primary if fallback was used) */
  modelUsed: string;
  /**
   * When `webSearch` is true (OpenRouter web plugin / :online), URL citations from the API
   * response, plus a URL-regex fallback from `text` if annotations are empty.
   */
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
  /** Abort the HTTP request after this many ms (0 = no timeout). */
  timeoutMs?: number;
  /** Feature name for usage tracking (e.g. 'idea_generation', 'script_generation') */
  feature?: string;
  /** User context for per-user usage tracking */
  userId?: string;
  userEmail?: string;
  /** OpenRouter ids to try first, before agency primary + fallbacks (deduped). */
  modelPreference?: string[];
}

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

  const fallback = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
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
        `OpenRouter request timed out after ${timeoutMs}ms. Try again or switch model in agency settings.`,
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

async function callOpenAI(
  model: string,
  options: CompletionOptions,
  apiKey: string,
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    ...openAiChatCompletionTokenFields(model, options.maxTokens),
  };

  const timeoutMs = options.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      throw new Error(
        `OpenAI request timed out after ${timeoutMs}ms. Try again or switch model in agency settings.`,
      );
    }
    throw err;
  }
  if (timeoutId) clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody.substring(0, 300)}`);
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
        'Authorization': `Bearer ${apiKey}`,
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
      throw new Error(
        `Dashscope request timed out after ${timeoutMs}ms. Try again or switch model in agency settings.`,
      );
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

function buildCompletionResultFromOpenRouter(
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

  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const estimatedCost = calculateCost(model, promptTokens, completionTokens);

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

export async function createCompletion(options: CompletionOptions): Promise<AICompletionResponse> {
  const { primary, fallbacks } = await getActiveModel();
  const policy = getFeatureRoutingPolicy(options.feature);
  const ordered = buildOrderedModelChain({
    explicitPreference: options.modelPreference,
    policyPreference: policy.chain,
    primary,
    fallbacks,
  });

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

  let lastError: Error | null = null;

  const openAiKey = await resolveOpenAiApiKeyForFeature(options.feature);
  const orKey = await resolveOpenRouterApiKeyForFeature(options.feature);
  const dsKey = resolveDashscopeApiKeyForFeature(options.feature);

  for (const model of ordered) {
    // Route dashscope/ prefixed models through the Dashscope provider
    if (model.startsWith('dashscope/')) {
      const dsModel = model.slice('dashscope/'.length);
      if (!dsKey) {
        lastError = new Error('Dashscope API key not configured (add DASHSCOPE_API_KEY)');
        continue;
      }
      try {
        const { data } = await callDashscope(dsModel, options);
        if (!data.choices || (data.choices as unknown[]).length === 0) {
          throw new Error('AI model returned no response. It may be overloaded.');
        }
        const content = (data.choices as { message?: { content?: string } }[])[0]?.message?.content || '';
        if (!content) throw new Error('AI model returned an empty response.');
        const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const estimatedCost = calculateCost(model, promptTokens, completionTokens);
        if (options.feature) {
          logUsage({
            service: 'dashscope',
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
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
          estimatedCost,
          modelUsed: model,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('budget exceeded')) throw lastError;
        const moreModels = ordered.indexOf(model) < ordered.length - 1;
        console.warn(
          `Dashscope model ${dsModel} failed, ${moreModels ? 'trying fallbacks' : 'no more fallbacks'}:`,
          lastError.message,
        );
        continue;
      }
    }

    const openAiModelId = options.webSearch ? null : toOpenAiChatModelId(model);

    if (openAiKey && openAiModelId) {
      try {
        const { data } = await callOpenAI(openAiModelId, options, openAiKey);

        if (!data.choices || (data.choices as unknown[]).length === 0) {
          console.error(`OpenAI model ${openAiModelId} returned no choices:`, JSON.stringify(data).substring(0, 500));
          throw new Error('AI model returned no response. It may be overloaded.');
        }

        const content = (data.choices as { message?: { content?: string } }[])[0]?.message?.content || '';
        if (!content) {
          console.error(`OpenAI model ${openAiModelId} returned empty content`);
          throw new Error('AI model returned an empty response.');
        }

        const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const estimatedCost = calculateCost(model, promptTokens, completionTokens);

        if (options.feature) {
          logUsage({
            service: 'openai',
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
        if (lastError.message.includes('budget exceeded')) {
          throw lastError;
        }
        const moreModels = ordered.indexOf(model) < ordered.length - 1;
        console.warn(
          `OpenAI model ${openAiModelId} failed, ${moreModels ? 'trying fallbacks' : 'no more fallbacks'}:`,
          lastError.message,
        );
        if (orKey) {
          try {
            const { data } = await callOpenRouter(model, options);
            return buildCompletionResultFromOpenRouter(data, model, options);
          } catch (orErr) {
            lastError = orErr instanceof Error ? orErr : new Error(String(orErr));
            if (lastError.message.includes('budget exceeded')) {
              throw lastError;
            }
            console.warn(`OpenRouter fallback for ${model} failed:`, lastError.message);
            continue;
          }
        }
        continue;
      }
    }

    if (!orKey) {
      lastError = new Error(
        'No API key configured. Add an OpenAI key or OpenRouter key in admin → AI models, or set OPENAI_API_KEY / OPENROUTER_API_KEY.',
      );
      continue;
    }

    try {
      const { data } = await callOpenRouter(model, options);
      return buildCompletionResultFromOpenRouter(data, model, options);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes('budget exceeded')) {
        throw lastError;
      }
      const creditsExhausted = lastError.message.includes('credits exhausted');
      const moreModels = ordered.indexOf(model) < ordered.length - 1;
      if (creditsExhausted && !moreModels) {
        throw lastError;
      }
      if (creditsExhausted && moreModels) {
        console.warn(`Model ${model} insufficient credits (402), trying next in chain:`, lastError.message);
        continue;
      }
      console.warn(`Model ${model} failed, ${moreModels ? 'trying next fallback' : 'no more fallbacks'}:`, lastError.message);
    }
  }

  throw lastError ?? new Error('All AI models failed. Try again later.');
}
