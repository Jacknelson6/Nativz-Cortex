import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveModel } from '@/lib/ai/client';
import { getIdeasModelFromDb, getLlmProviderKeysForAdmin, getNerdModelFromDb } from '@/lib/ai/provider-keys';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';
import {
  buildOrderedModelChain,
  getFeatureRoutingPolicy,
  getFeatureRoutingSummaryItems,
} from '@/lib/ai/routing-policy';
import { toOpenAiChatModelId } from '@/lib/ai/openai-model-id';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();

  if (!userData || userData.role !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

function hasConfiguredKey(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * GET /api/settings/ai-routing-summary
 *
 * Returns resolved routing chains for major AI feature groups so the admin UI
 * can show what the app will actually try for each workload.
 *
 * @auth Required (admin)
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const [{ primary, fallbacks }, topicModels, nerdModel, ideasModel, keys] = await Promise.all([
      getActiveModel(),
      getTopicSearchModelsFromDb(),
      getNerdModelFromDb(),
      getIdeasModelFromDb(),
      getLlmProviderKeysForAdmin(),
    ]);

    const openAi = keys.openai ?? {};
    const openRouter = keys.openrouter ?? {};
    const hasOpenAiDefault = hasConfiguredKey(openAi.default) || hasConfiguredKey(process.env.OPENAI_API_KEY);
    const hasOpenAiNerd = hasConfiguredKey(openAi.nerd) || hasConfiguredKey(openAi.default) || hasConfiguredKey(process.env.OPENAI_API_KEY);
    const hasOpenRouterNerd =
      hasConfiguredKey(openRouter.nerd) ||
      hasConfiguredKey(openRouter.default) ||
      hasConfiguredKey(process.env.OPENROUTER_API_KEY);

    const standardGroups = getFeatureRoutingSummaryItems().map((group) => ({
      ...group,
      effectiveChain: buildOrderedModelChain({
        policyPreference: group.chain,
        primary,
        fallbacks,
      }),
    }));

    const topicPolicy = getFeatureRoutingPolicy('topic_search');
    const ideasPolicy = getFeatureRoutingPolicy('idea_generation');
    const topicPlannerChain = buildOrderedModelChain({
      explicitPreference: [topicModels.planner],
      policyPreference: topicPolicy.chain,
      primary,
      fallbacks,
    });
    const topicResearchChain = buildOrderedModelChain({
      explicitPreference: [topicModels.research],
      policyPreference: topicPolicy.chain,
      primary,
      fallbacks,
    });
    const topicMergerChain = buildOrderedModelChain({
      explicitPreference: topicModels.merger ? [topicModels.merger] : [],
      policyPreference: topicPolicy.chain,
      primary,
      fallbacks,
    });
    const ideasChain = buildOrderedModelChain({
      explicitPreference: ideasModel ? [ideasModel] : [],
      policyPreference: ideasPolicy.chain,
      primary,
      fallbacks,
    });

    const nerdUsesOpenAi = Boolean(toOpenAiChatModelId(nerdModel)) && hasOpenAiNerd;
    const nerdProvider =
      nerdUsesOpenAi ? 'openai' : hasOpenRouterNerd ? 'openrouter' : 'unconfigured';

    return NextResponse.json({
      configured: {
        default: { primary, fallbacks },
        topicSearch: {
          planner: topicModels.planner,
          research: topicModels.research,
          merger: topicModels.merger,
          plannerChain: topicPlannerChain,
          researchChain: topicResearchChain,
          mergerChain: topicMergerChain,
        },
        ideas: {
          override: ideasModel,
          chain: ideasChain,
        },
        agents: {
          model: nerdModel,
          provider: nerdProvider,
          prefersOpenAi: nerdUsesOpenAi,
          hasOpenAiKey: hasOpenAiDefault || hasOpenAiNerd,
          chain: nerdModel ? [nerdModel] : [],
        },
      },
      policyGroups: standardGroups,
    });
  } catch (error) {
    console.error('GET /api/settings/ai-routing-summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
