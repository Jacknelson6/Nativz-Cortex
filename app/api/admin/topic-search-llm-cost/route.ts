import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';

export const dynamic = 'force-dynamic';

interface OpenRouterPricing {
  promptPricePerM: number;
  completionPricePerM: number;
  isVariable: boolean;
}

interface ModelsCacheEntry {
  pricingByModel: Map<string, OpenRouterPricing>;
  fetchedAt: number;
}

let modelsCache: ModelsCacheEntry | null = null;
const MODELS_TTL_MS = 10 * 60 * 1000;

async function getOpenRouterPricing(): Promise<Map<string, OpenRouterPricing>> {
  const now = Date.now();
  if (modelsCache && now - modelsCache.fetchedAt < MODELS_TTL_MS) {
    return modelsCache.pricingByModel;
  }

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    if (modelsCache) return modelsCache.pricingByModel;
    throw new Error(`OpenRouter API error: ${res.status}`);
  }

  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const map = new Map<string, OpenRouterPricing>();
  for (const m of json.data ?? []) {
    const id = m.id as string | undefined;
    if (!id) continue;
    const pricing = m.pricing as { prompt?: string; completion?: string } | undefined;
    const promptPerToken = parseFloat(pricing?.prompt ?? '0');
    const completionPerToken = parseFloat(pricing?.completion ?? '0');
    const isVariable = promptPerToken < 0 || completionPerToken < 0;
    map.set(id, {
      promptPricePerM: isVariable ? -1 : promptPerToken * 1_000_000,
      completionPricePerM: isVariable ? -1 : completionPerToken * 1_000_000,
      isVariable,
    });
  }

  modelsCache = { pricingByModel: map, fetchedAt: now };
  return map;
}

const FALLBACK_AVG_INPUT = 12_000;
const FALLBACK_AVG_OUTPUT = 2_500;
const WINDOW_DAYS = 30;

/**
 * GET /api/admin/topic-search-llm-cost
 *
 * Estimated LLM cost for one topic search:
 *   - currently configured topic-search model (from agency_settings)
 *   - that model's live per-1M-token pricing (OpenRouter)
 *   - empirical avg input/output tokens per search over the last 30 days
 *   - resulting estimated $/search
 *
 * Token averages come from `api_usage_logs` rows where `feature` starts with
 * `topic_search`, divided by the number of completed `topic_searches` in the
 * same window. If the sample is empty we fall back to coarse defaults so the
 * card never blanks out — `sampleSize` lets the UI flag low-confidence math.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [settingsRes, usageRes, searchCountRes, pricingMap] = await Promise.all([
    admin
      .from('agency_settings')
      .select('topic_search_planner_model, topic_search_research_model, topic_search_merger_model')
      .eq('agency', 'nativz')
      .maybeSingle(),
    admin
      .from('api_usage_logs')
      .select('input_tokens, output_tokens, feature')
      .like('feature', 'topic_search%')
      .gte('created_at', since),
    admin
      .from('topic_searches')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    getOpenRouterPricing().catch(() => null),
  ]);

  const modelId =
    settingsRes.data?.topic_search_planner_model?.trim() ||
    settingsRes.data?.topic_search_research_model?.trim() ||
    settingsRes.data?.topic_search_merger_model?.trim() ||
    DEFAULT_OPENROUTER_MODEL;

  const usage = usageRes.data ?? [];
  const searchCount = searchCountRes.count ?? 0;
  const sumInput = usage.reduce((acc, r) => acc + (Number(r.input_tokens) || 0), 0);
  const sumOutput = usage.reduce((acc, r) => acc + (Number(r.output_tokens) || 0), 0);

  const hasSample = searchCount > 0 && usage.length > 0;
  const avgInputTokens = hasSample ? Math.round(sumInput / searchCount) : FALLBACK_AVG_INPUT;
  const avgOutputTokens = hasSample ? Math.round(sumOutput / searchCount) : FALLBACK_AVG_OUTPUT;

  const pricing = pricingMap?.get(modelId) ?? null;
  const promptPricePerM = pricing && !pricing.isVariable ? pricing.promptPricePerM : null;
  const completionPricePerM = pricing && !pricing.isVariable ? pricing.completionPricePerM : null;

  const costUsd =
    promptPricePerM != null && completionPricePerM != null
      ? (avgInputTokens * promptPricePerM) / 1_000_000 +
        (avgOutputTokens * completionPricePerM) / 1_000_000
      : null;

  return NextResponse.json({
    modelId,
    promptPricePerM,
    completionPricePerM,
    avgInputTokens,
    avgOutputTokens,
    costUsd,
    sampleSize: searchCount,
    windowDays: WINDOW_DAYS,
    pricingAvailable: pricing != null,
  });
}
