import { getActiveModel } from './client';
import { resolveOpenRouterApiKeyForFeature } from './provider-keys';
import { calculateCost, logUsage } from './usage';

export type OpenRouterRichMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Record<string, unknown>[];
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

type OpenRouterResponsePayload = {
  /** Generation id — used by the webhook to reconcile our local row to
   *  OpenRouter's post-billing cost. Stamp it into metadata on logUsage. */
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: OpenRouterUsage;
};

/**
 * Resolve the single model + API key for OpenRouter calls.
 * Uses modelPreference[0] if provided, otherwise the DB-configured model.
 */
export async function resolveOpenRouterChain(options: {
  feature?: string;
  modelPreference?: string[];
}): Promise<{ apiKey: string; model: string }> {
  const apiKey = await resolveOpenRouterApiKeyForFeature(options.feature);
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key is not configured (add OPENROUTER_API_KEY or set keys in admin → AI models)',
    );
  }

  const dbModel = await getActiveModel();
  const model = options.modelPreference?.[0]?.trim() || dbModel;

  return { apiKey, model };
}

export async function createOpenRouterRichCompletion(options: {
  messages: OpenRouterRichMessage[];
  maxTokens: number;
  feature?: string;
  userId?: string;
  userEmail?: string;
  modelPreference?: string[];
  timeoutMs?: number;
  temperature?: number;
}): Promise<{
  text: string;
  data: OpenRouterResponsePayload;
  modelUsed: string;
  estimatedCost: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const { apiKey, model } = await resolveOpenRouterChain(options);
  const timeoutMs = options.timeoutMs ?? 0;

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Nativz Cortex',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        messages: options.messages,
      }),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 402) {
        throw new Error('AI credits exhausted. Add credits at openrouter.ai/settings/credits');
      }
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorBody.substring(0, 300)}`,
      );
    }

    const data = (await response.json()) as OpenRouterResponsePayload;
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new Error('AI model returned an empty response.');
    }

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    const estimatedCost = calculateCost(model, promptTokens, completionTokens);

    if (options.feature) {
      const generationId = data.id?.trim();
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
        // Stamp the generation id so the OpenRouter webhook can locate
        // this row and overwrite cost with post-billing truth. Without
        // this, the webhook takes the insert path every time and the
        // "Reconciled %" tile can't climb past 50%.
        metadata: generationId ? { openrouter_generation_id: generationId } : undefined,
      }).catch(() => {});
    }

    return {
      text,
      data,
      modelUsed: model,
      estimatedCost,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const message =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
        ? `OpenRouter request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(message);
  }
}

export async function createOpenRouterTextStream(options: {
  messages: OpenRouterRichMessage[];
  maxTokens: number;
  feature?: string;
  modelPreference?: string[];
  extraHeaders?: Record<string, string>;
}): Promise<{ response: Response; modelUsed: string }> {
  const { apiKey, model } = await resolveOpenRouterChain(options);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Nativz Cortex',
      ...(options.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: options.maxTokens,
      messages: options.messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorBody.substring(0, 300)}`,
    );
  }

  return { response, modelUsed: model };
}
