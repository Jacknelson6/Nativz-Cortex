import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from './openrouter-default-model';

/** Buckets stored under llm_provider_keys.openrouter / .openai (ideas hub uses `default`). */
export type LlmProviderKeyBucket = 'default' | 'topic_search' | 'nerd';

export type LlmProviderKeysStored = {
  openrouter?: Partial<Record<LlmProviderKeyBucket, string>>;
  /** Direct OpenAI API keys (api.openai.com) per workload */
  openai?: Partial<Record<LlmProviderKeyBucket, string>>;
  /** Dashscope (Alibaba/Qwen) API keys per workload */
  dashscope?: Partial<Record<LlmProviderKeyBucket, string>>;
};

/** @deprecated use LlmProviderKeyBucket */
export type OpenRouterKeyBucket = LlmProviderKeyBucket;

const DEFAULT_NERD_MODEL = 'openai/gpt-5.4-mini';

/**
 * Some rows in agency_settings.llm_provider_keys.openrouter were written by an
 * older code path as base64-wrapped `{v:"v2",c,k}` envelopes that nothing in
 * the current codebase can decrypt. The current write path stores plaintext.
 * Treat any stale envelope as "not configured" so resolution falls through to
 * env vars instead of sending the encrypted blob as a Bearer token.
 */
function isStaleEnvelope(value: string): boolean {
  if (!value.startsWith('eyJ')) return false;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return decoded && typeof decoded === 'object' && decoded.v === 'v2' && 'c' in decoded;
  } catch {
    return false;
  }
}

/** Legacy JSON used `ideas`; treat as `default` when resolving keys. */
function keyForBucket(
  stored: Partial<Record<string, string | undefined>> | undefined,
  bucket: LlmProviderKeyBucket,
): string | undefined {
  const s = stored ?? {};
  const direct = s[bucket]?.trim();
  if (direct && !isStaleEnvelope(direct)) return direct;
  if (bucket === 'default') {
    const legacy = (s as Record<string, string | undefined>).ideas?.trim();
    if (legacy && !isStaleEnvelope(legacy)) return legacy;
  }
  return undefined;
}

let cachedKeys: LlmProviderKeysStored | null = null;
let cachedNerdModel: string | null = null;
let cachedIdeasModel: string | null = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

function nowMs() {
  return Date.now();
}

/**
 * Map usage-tracking feature names to a credential bucket.
 * Unknown features use the default OpenRouter key chain.
 */
export function openRouterBucketForFeature(feature?: string): LlmProviderKeyBucket {
  if (!feature) return 'default';
  const f = feature.toLowerCase();
  if (
    f === 'topic_search' ||
    f === 'topic_expansion' ||
    f === 'emotion_explain' ||
    f.startsWith('topic_')
  ) {
    return 'topic_search';
  }
  if (f === 'idea_generation' || f === 'script_generation') return 'default';
  if (f === 'nerd_title' || f.startsWith('nerd')) return 'nerd';
  return 'default';
}

async function loadFromDb(): Promise<void> {
  const t = nowMs();
  if (cachedKeys && t - cachedAt < TTL) return;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('agency_settings')
      .select('llm_provider_keys, nerd_model, ideas_model')
      .eq('agency', 'nativz')
      .single();

    const raw = data?.llm_provider_keys as LlmProviderKeysStored | null;
    cachedKeys = raw && typeof raw === 'object' ? raw : {};
    cachedNerdModel = typeof data?.nerd_model === 'string' ? data.nerd_model.trim() : '';
    cachedIdeasModel = typeof data?.ideas_model === 'string' ? data.ideas_model.trim() : '';
    cachedAt = t;
  } catch (e) {
    console.error('loadFromDb llm keys:', e);
    cachedKeys = {};
    cachedNerdModel = '';
    cachedIdeasModel = '';
    cachedAt = t;
  }
}

/**
 * Resolve the OpenRouter API key for a feature: per-bucket override → global override → env.
 */
export async function resolveOpenRouterApiKeyForFeature(feature?: string): Promise<string> {
  await loadFromDb();
  const bucket = openRouterBucketForFeature(feature);
  const or = cachedKeys?.openrouter ?? {};
  const specific = keyForBucket(or, bucket);
  const fallbackChain = bucket === 'default' ? '' : keyForBucket(or, 'default');
  const env = process.env.OPENROUTER_API_KEY?.trim();
  return specific || fallbackChain || env || '';
}

/**
 * OpenAI API key (platform.openai.com) for a feature: per-bucket → default bucket → OPENAI_API_KEY.
 */
export async function resolveOpenAiApiKeyForFeature(feature?: string): Promise<string> {
  await loadFromDb();
  const bucket = openRouterBucketForFeature(feature);
  const oa = cachedKeys?.openai ?? {};
  const specific = keyForBucket(oa, bucket);
  const fallbackChain = bucket === 'default' ? '' : keyForBucket(oa, 'default');
  const env = process.env.OPENAI_API_KEY?.trim();
  return specific || fallbackChain || env || '';
}

/**
 * Dashscope API key — always from environment (no per-bucket DB overrides for now).
 */
export function resolveDashscopeApiKeyForFeature(_feature?: string): string {
  return process.env.DASHSCOPE_API_KEY?.trim() ?? '';
}

export async function getNerdModelFromDb(): Promise<string> {
  await loadFromDb();
  const model = cachedNerdModel || '';
  // Filter out known-broken free-tier models
  if (!model || model.includes(':free')) return DEFAULT_NERD_MODEL;
  return model;
}

/** Empty string means “use platform primary + fallbacks” in createCompletion */
export async function getIdeasModelFromDb(): Promise<string> {
  await loadFromDb();
  return cachedIdeasModel ?? '';
}

export async function getLlmProviderKeysForAdmin(): Promise<LlmProviderKeysStored> {
  await loadFromDb();
  return { ...(cachedKeys ?? {}) };
}

export function clearLlmProviderKeysCache() {
  cachedKeys = null;
  cachedNerdModel = null;
  cachedIdeasModel = null;
  cachedAt = 0;
}

export function maskApiKey(key: string | undefined | null): string | null {
  if (!key || !key.trim()) return null;
  const k = key.trim();
  if (k.length <= 10) return '••••••••';
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}
