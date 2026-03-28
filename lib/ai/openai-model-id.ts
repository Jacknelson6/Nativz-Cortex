/**
 * Map a Cortex / OpenRouter-style model id to an OpenAI API `model` name.
 * Returns null when the model is not served on OpenAI’s native API (use OpenRouter instead).
 */
export function toOpenAiChatModelId(model: string): string | null {
  const m = model.trim();
  if (!m) return null;

  if (m.startsWith('openai/')) {
    return m.slice('openai/'.length).trim() || null;
  }

  // Already an OpenAI native id (no provider prefix)
  if (!m.includes('/')) {
    if (/^(gpt-|o\d|chatgpt-|ft:)/i.test(m)) return m;
    return null;
  }

  // anthropic/*, google/*, openrouter/*, meta-llama/*, etc.
  return null;
}

/**
 * Chat Completions body: GPT-5.x and o-series reject `max_tokens` and require
 * `max_completion_tokens` (see OpenAI API error unsupported_parameter on max_tokens).
 */
export function openAiChatCompletionTokenFields(
  modelId: string,
  maxTokens: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  const id = modelId.trim().toLowerCase();
  if (id.startsWith('gpt-5') || /^o\d/.test(id)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}
