/**
 * Shared formatters + classifiers for AI usage / cost UIs.
 *
 * Kept in one place so the infrastructure dashboard, the usage dashboard,
 * the AI tab's provider roll-up, and any future surface can agree on what
 * "openai/gpt-4o-mini", "$0.0034", and "1.2K" render as. Before this file
 * existed each surface had its own slightly-drifted copy.
 */

// ── Provider classification ────────────────────────────────────────────────

/**
 * Classify a model identifier into a provider bucket. Handles both the
 * canonical `provider/model` form (`anthropic/claude-sonnet-4-5`) and the
 * un-prefixed names a few direct-SDK call sites still emit
 * (`gemini-embedding-001`, `whisper-large-v3-turbo`, `gpt-4o-mini`).
 *
 * Order matters — the most specific prefix wins. Bare model names fall
 * through to the family heuristics below so we never land on "unknown"
 * for models we actually recognise.
 */
export function providerFromModel(model?: string | null): string {
  if (!model) return 'unknown';
  const m = model.toLowerCase();

  // Canonical `provider/model` shapes (OpenRouter slugs).
  if (m.startsWith('openai/')) return 'openai';
  if (m.startsWith('anthropic/')) return 'anthropic';
  if (m.startsWith('google/') || m.startsWith('gemini/')) return 'google';
  if (m.startsWith('perplexity/')) return 'perplexity';
  if (m.startsWith('openrouter/')) return 'openrouter';
  if (m.startsWith('groq/')) return 'groq';

  // Bare model names — route by family.
  if (m.startsWith('gpt-') || m.includes('/gpt-')) return 'openai';
  if (m.startsWith('claude-') || m.includes('/claude-')) return 'anthropic';
  if (m.startsWith('gemini-') || m.includes('/gemini-')) return 'google';
  if (m.startsWith('whisper')) return 'groq';
  if (m.includes('grok')) return 'grok';
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('qwen') || m.startsWith('dashscope/')) return 'qwen';
  if (m.startsWith('nvidia')) return 'nvidia';
  if (m.startsWith('mistral')) return 'mistral';

  // Fallback — if there's a slug prefix use it; otherwise return the whole
  // name so the UI at least shows which model is unclassified rather than
  // silently lumping distinct providers into "unknown".
  const prefix = m.split('/')[0];
  return prefix && prefix !== m ? prefix : 'unknown';
}

export const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google (Gemini)',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  grok: 'Grok (xAI)',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  nvidia: 'NVIDIA',
  mistral: 'Mistral',
  unknown: 'Unclassified',
};

export function providerLabel(slug: string): string {
  return PROVIDER_LABELS[slug] ?? slug;
}

// ── Dollar + token formatting ──────────────────────────────────────────────

/**
 * Full-precision dollar formatter for summary tiles and tables. Shows
 * `<$0.01` for non-zero sub-penny values so "free-looking" calls still
 * signal they cost *something*.
 */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Shorter dollar formatter for axis labels where `$1,234.56` would wrap
 * or crowd. Uses `k` suffix above $1,000.
 */
export function formatUsdAxis(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

/** `1,234 → 1.2K · 1,234,567 → 1.23M`. Tuned for chart axes + tables. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
