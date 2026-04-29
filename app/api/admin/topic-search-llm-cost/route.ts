import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import { getOpenRouterModel } from '@/lib/ai/openrouter-models';

export const dynamic = 'force-dynamic';

const FALLBACK_AVG_INPUT = 12_000;
const FALLBACK_AVG_OUTPUT = 2_500;
const WINDOW_DAYS = 30;

/**
 * GET /api/admin/topic-search-llm-cost
 *
 * Estimated LLM cost for one topic search:
 *   - currently configured topic-search model (from agency_settings)
 *   - that model's per-1M-token pricing (cached OpenRouter catalog)
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

  const [settingsRes, usageRes, searchCountRes] = await Promise.all([
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

  const model = await getOpenRouterModel(admin, modelId).catch(() => null);
  const pricingAvailable = model != null && !model.isVariable;
  const promptPricePerM = pricingAvailable ? model!.promptPrice : null;
  const completionPricePerM = pricingAvailable ? model!.completionPrice : null;

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
    pricingAvailable,
  });
}
