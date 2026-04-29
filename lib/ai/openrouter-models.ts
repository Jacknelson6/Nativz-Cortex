/**
 * Shared accessors for the OpenRouter model catalog.
 *
 * The live API is hit only by the twice-monthly cron at
 * /api/cron/refresh-openrouter-models. Read-path callers (the catalog
 * dropdown + the topic-search LLM cost estimator) read from the
 * `openrouter_models` table populated by that cron. If the cache is empty
 * (fresh deploy before the cron has fired) `getOpenRouterModels()` falls
 * back to a single live fetch + upsert so the UI never blanks out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  inputModalities: string[];
  outputModalities: string[];
  /** Per 1M tokens. -1 = variable pricing (auto-router). */
  promptPrice: number;
  /** Per 1M tokens. -1 = variable pricing (auto-router). */
  completionPrice: number;
  isFree: boolean;
  isVariable: boolean;
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Sort: free first, then alphabetic by name. Mirrors prior catalog order. */
function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function fetchOpenRouterModelsLive(): Promise<OpenRouterModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status}`);
  }

  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const models: OpenRouterModel[] = (json.data ?? []).map((m) => {
    const arch = m.architecture as
      | { input_modalities?: string[]; output_modalities?: string[] }
      | undefined;
    const pricing = m.pricing as { prompt?: string; completion?: string } | undefined;
    const promptPerToken = parseFloat(pricing?.prompt ?? '0');
    const completionPerToken = parseFloat(pricing?.completion ?? '0');
    const isVariable = promptPerToken < 0 || completionPerToken < 0;

    return {
      id: m.id as string,
      name: (m.name as string) || (m.id as string),
      description: (m.description as string) || '',
      contextLength: (m.context_length as number) || 0,
      inputModalities: arch?.input_modalities ?? ['text'],
      outputModalities: arch?.output_modalities ?? ['text'],
      promptPrice: isVariable ? -1 : promptPerToken * 1_000_000,
      completionPrice: isVariable ? -1 : completionPerToken * 1_000_000,
      isFree: !isVariable && promptPerToken === 0 && completionPerToken === 0,
      isVariable,
    };
  });

  return sortModels(models);
}

export async function upsertOpenRouterModels(
  admin: SupabaseClient,
  models: OpenRouterModel[],
): Promise<{ inserted: number; pruned: number }> {
  if (models.length === 0) return { inserted: 0, pruned: 0 };

  const syncedAt = new Date().toISOString();
  const rows = models.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    context_length: m.contextLength,
    input_modalities: m.inputModalities,
    output_modalities: m.outputModalities,
    prompt_price_per_m: m.promptPrice,
    completion_price_per_m: m.completionPrice,
    is_free: m.isFree,
    is_variable: m.isVariable,
    raw: {
      id: m.id,
      name: m.name,
      description: m.description,
      contextLength: m.contextLength,
      inputModalities: m.inputModalities,
      outputModalities: m.outputModalities,
      promptPrice: m.promptPrice,
      completionPrice: m.completionPrice,
      isFree: m.isFree,
      isVariable: m.isVariable,
    },
    synced_at: syncedAt,
  }));

  const { error: upsertErr } = await admin.from('openrouter_models').upsert(rows, {
    onConflict: 'id',
  });
  if (upsertErr) throw upsertErr;

  // Prune rows OpenRouter no longer returns. Anything not touched by this
  // sync (synced_at < syncedAt) was removed upstream.
  const { error: pruneErr, count: prunedCount } = await admin
    .from('openrouter_models')
    .delete({ count: 'exact' })
    .lt('synced_at', syncedAt);
  if (pruneErr) throw pruneErr;

  return { inserted: rows.length, pruned: prunedCount ?? 0 };
}

function rowToModel(row: Record<string, unknown>): OpenRouterModel {
  const promptPrice = row.prompt_price_per_m == null ? 0 : Number(row.prompt_price_per_m);
  const completionPrice =
    row.completion_price_per_m == null ? 0 : Number(row.completion_price_per_m);
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    contextLength: (row.context_length as number) ?? 0,
    inputModalities: (row.input_modalities as string[]) ?? ['text'],
    outputModalities: (row.output_modalities as string[]) ?? ['text'],
    promptPrice,
    completionPrice,
    isFree: Boolean(row.is_free),
    isVariable: Boolean(row.is_variable),
  };
}

export interface CachedModelsResult {
  models: OpenRouterModel[];
  /** When the catalog was last refreshed by the cron (or live fallback). */
  refreshedAt: string | null;
  source: 'cache' | 'live-fallback';
}

/**
 * Read the cached catalog. If the table is empty (fresh deploy), fall back
 * to one live fetch and upsert so the next call hits cache.
 */
export async function getOpenRouterModels(admin: SupabaseClient): Promise<CachedModelsResult> {
  const { data, error } = await admin
    .from('openrouter_models')
    .select('*')
    .order('is_free', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;

  if (data && data.length > 0) {
    const refreshedAt = data.reduce<string | null>((latest, row) => {
      const ts = (row.synced_at as string) ?? null;
      if (!latest) return ts;
      if (!ts) return latest;
      return ts > latest ? ts : latest;
    }, null);
    return {
      models: sortModels(data.map(rowToModel)),
      refreshedAt,
      source: 'cache',
    };
  }

  // Cold cache → one live fetch, upsert, return.
  const live = await fetchOpenRouterModelsLive();
  await upsertOpenRouterModels(admin, live).catch((err) => {
    console.warn('openrouter-models cold-cache upsert failed:', err);
  });
  return { models: live, refreshedAt: new Date().toISOString(), source: 'live-fallback' };
}

/** Cheap single-row lookup for the LLM cost estimator. */
export async function getOpenRouterModel(
  admin: SupabaseClient,
  modelId: string,
): Promise<OpenRouterModel | null> {
  const { data } = await admin
    .from('openrouter_models')
    .select('*')
    .eq('id', modelId)
    .maybeSingle();
  if (data) return rowToModel(data);

  // Cold cache or unknown id — try a live refresh once, then re-read. If the
  // id genuinely isn't in OpenRouter's catalog we'll still return null.
  try {
    const live = await fetchOpenRouterModelsLive();
    await upsertOpenRouterModels(admin, live);
    return live.find((m) => m.id === modelId) ?? null;
  } catch (err) {
    console.warn('openrouter-models live fallback failed:', err);
    return null;
  }
}
