/**
 * Backend selection used to be runtime-inferred from the model id (e.g. an
 * `openai/…` slug + an OpenAI key would short-circuit to OpenAI's native API).
 * That ambiguity is gone — every Cortex feature now goes through OpenRouter so
 * a single key + slug controls the whole pipeline. These helpers are kept as
 * shims so legacy callers don't need to be refactored, but the result is
 * always `'openrouter'`.
 */

export type ModelBackend = 'openrouter';

/** Always returns `'openrouter'`. The codebase no longer routes to OpenAI direct. */
export function inferModelBackend(_modelId: string): ModelBackend {
  return 'openrouter';
}

/**
 * Normalizes a stored or user-typed OpenAI chat model id to the `openai/…`
 * form OpenRouter expects. Pass-through for already-prefixed values and for
 * non-OpenAI slugs (`anthropic/…`, `google/…`, etc.).
 */
export function toOpenAiPrefixedModel(nativeOrPrefixed: string): string {
  const t = nativeOrPrefixed.trim();
  if (!t) return '';
  if (t.includes('/')) return t;
  return `openai/${t}`;
}
