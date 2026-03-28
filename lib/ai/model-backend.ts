import { toOpenAiChatModelId } from '@/lib/ai/openai-model-id';

export type ModelBackend = 'openrouter' | 'openai';

/** Infer whether a stored model id is intended for OpenAI’s native API vs OpenRouter. */
export function inferModelBackend(modelId: string): ModelBackend {
  const m = modelId.trim();
  if (!m) return 'openrouter';
  return toOpenAiChatModelId(m) ? 'openai' : 'openrouter';
}

/** Normalize a user-picked OpenAI chat model to Cortex style (`openai/gpt-4o-mini`). */
export function toOpenAiPrefixedModel(nativeOrPrefixed: string): string {
  const t = nativeOrPrefixed.trim();
  if (!t) return '';
  if (t.startsWith('openai/')) return t;
  return `openai/${t}`;
}
