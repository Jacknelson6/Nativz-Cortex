import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import { getOpenRouterModel } from '@/lib/ai/openrouter-models';

export const dynamic = 'force-dynamic';

const FALLBACK_AVG_INPUT = 40_000;
const FALLBACK_AVG_OUTPUT = 5_000;
const WINDOW_DAYS = 30;
/** A topic search fires ~8 LLM calls in <100ms; group rows that share user_id
 * + this bucket into one session. 1-minute is generous enough to cover the
 * slowest pipeline runs without colliding with a follow-up search. */
const SESSION_BUCKET_MS = 60_000;

/**
 * GET /api/admin/topic-search-llm-cost
 *
 * Estimated LLM cost for one topic search:
 *   - currently configured topic-search model (from agency_settings)
 *   - that model's per-1M-token pricing (cached OpenRouter catalog)
 *   - empirical avg input/output tokens per search over the last 30 days
 *   - resulting estimated $/search
 *
 * The pipeline fires multiple LLM calls per search (planner + per-subtopic
 * research + merger) and `api_usage_logs` doesn't carry a `search_id`, so
 * we infer sessions by bucketing rows by `(user_id, minute)`. This matches
 * what an operator means by "one search" and avoids the old bug where we
 * divided total tokens by `topic_searches.count` — which over-counts because
 * many searches in the window pre-date the LLM pipeline (zero log rows) and
 * dilute the average to ~5% of reality.
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

  const [settingsRes, usageRes] = await Promise.all([
    admin
      .from('agency_settings')
      .select('topic_search_planner_model, topic_search_research_model, topic_search_merger_model')
      .eq('agency', 'nativz')
      .maybeSingle(),
    admin
      .from('api_usage_logs')
      .select('user_id, created_at, input_tokens, output_tokens')
      .like('feature', 'topic_search%')
      .gte('created_at', since),
  ]);

  const modelId =
    settingsRes.data?.topic_search_planner_model?.trim() ||
    settingsRes.data?.topic_search_research_model?.trim() ||
    settingsRes.data?.topic_search_merger_model?.trim() ||
    DEFAULT_OPENROUTER_MODEL;

  // Bucket calls into search sessions. Key = `${user_id}|${minute_bucket}`;
  // any rows within SESSION_BUCKET_MS of each other from the same user fold
  // into one session even if the wall-clock straddles a minute boundary.
  const sessions = new Map<string, { in: number; out: number }>();
  for (const row of usageRes.data ?? []) {
    const ts = new Date(row.created_at).getTime();
    const bucket = Math.floor(ts / SESSION_BUCKET_MS);
    const key = `${row.user_id ?? 'anon'}|${bucket}`;
    const session = sessions.get(key) ?? { in: 0, out: 0 };
    session.in += Number(row.input_tokens) || 0;
    session.out += Number(row.output_tokens) || 0;
    sessions.set(key, session);
  }

  const sessionList = [...sessions.values()];
  const sampleSize = sessionList.length;
  const hasSample = sampleSize > 0;
  const avgInputTokens = hasSample
    ? Math.round(sessionList.reduce((acc, s) => acc + s.in, 0) / sampleSize)
    : FALLBACK_AVG_INPUT;
  const avgOutputTokens = hasSample
    ? Math.round(sessionList.reduce((acc, s) => acc + s.out, 0) / sampleSize)
    : FALLBACK_AVG_OUTPUT;

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
    sampleSize,
    windowDays: WINDOW_DAYS,
    pricingAvailable,
  });
}
