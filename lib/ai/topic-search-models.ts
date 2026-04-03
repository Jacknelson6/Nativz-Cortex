import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';

const DEFAULT_PLANNER = DEFAULT_OPENROUTER_MODEL;
const DEFAULT_RESEARCH = DEFAULT_OPENROUTER_MODEL;

let cached: {
  planner: string;
  research: string;
  merger: string;
} | null = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

function fromEnv(): { planner: string; research: string; merger: string } {
  return {
    planner: process.env.TOPIC_SEARCH_PLANNER_MODEL?.trim() || DEFAULT_PLANNER,
    research: process.env.TOPIC_SEARCH_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH,
    merger: process.env.TOPIC_SEARCH_MERGER_MODEL?.trim() || '',
  };
}

/**
 * Planner, research, and merger OpenRouter model ids for topic search (llm_v1).
 * agency_settings overrides env; 5-minute cache.
 */
export async function getTopicSearchModelsFromDb(): Promise<{
  planner: string;
  research: string;
  merger: string;
}> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL) {
    return cached;
  }

  const fallback = fromEnv();

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('agency_settings')
      .select('topic_search_planner_model, topic_search_research_model, topic_search_merger_model')
      .eq('agency', 'nativz')
      .single();

    cached = {
      planner: data?.topic_search_planner_model?.trim() || fallback.planner,
      research: data?.topic_search_research_model?.trim() || fallback.research,
      merger: data?.topic_search_merger_model?.trim() ?? fallback.merger,
    };
    cachedAt = now;
    return cached;
  } catch (e) {
    console.error('getTopicSearchModelsFromDb:', e);
    cached = fallback;
    cachedAt = now;
    return cached;
  }
}

export function clearTopicSearchModelCache() {
  cached = null;
  cachedAt = 0;
}
