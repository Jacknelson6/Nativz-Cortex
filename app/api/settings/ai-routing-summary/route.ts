import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveModel } from '@/lib/ai/client';
import { getLlmProviderKeysForAdmin, getNerdModelFromDb } from '@/lib/ai/provider-keys';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';
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
 * Returns the active AI model and overrides for the admin settings UI.
 * Simplified: one model for everything, switchable from dashboard.
 *
 * @auth Required (admin)
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const [activeModel, topicModels, nerdModel, keys] = await Promise.all([
      getActiveModel(),
      getTopicSearchModelsFromDb(),
      getNerdModelFromDb(),
      getLlmProviderKeysForAdmin(),
    ]);

    const openAi = keys.openai ?? {};
    const openRouter = keys.openrouter ?? {};
    const hasOpenAiKey = hasConfiguredKey(openAi.default) || hasConfiguredKey(openAi.nerd) || hasConfiguredKey(process.env.OPENAI_API_KEY);
    const hasOpenRouterKey =
      hasConfiguredKey(openRouter.default) ||
      hasConfiguredKey(openRouter.nerd) ||
      hasConfiguredKey(process.env.OPENROUTER_API_KEY);

    const nerdUsesOpenAi = Boolean(toOpenAiChatModelId(nerdModel)) && hasOpenAiKey;
    const nerdProvider =
      nerdUsesOpenAi ? 'openai' : hasOpenRouterKey ? 'openrouter' : 'unconfigured';

    return NextResponse.json({
      configured: {
        default: { primary: activeModel },
        topicSearch: {
          planner: topicModels.planner || activeModel,
          research: topicModels.research || activeModel,
          merger: topicModels.merger || activeModel,
        },
        agents: {
          model: nerdModel || activeModel,
          provider: nerdProvider,
          prefersOpenAi: nerdUsesOpenAi,
          hasOpenAiKey,
        },
      },
    });
  } catch (error) {
    console.error('GET /api/settings/ai-routing-summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
