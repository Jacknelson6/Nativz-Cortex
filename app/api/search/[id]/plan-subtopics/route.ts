import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { plannerOutputSchema } from '@/lib/search/llm-pipeline/schemas';

export const maxDuration = 120;

/**
 * POST /api/search/[id]/plan-subtopics
 * Propose up to 5 subtopics for the search query (llm_v1 pipeline only).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: search, error: fetchErr } = await admin
      .from('topic_searches')
      .select('id, query, topic_pipeline, status')
      .eq('id', id)
      .single();

    if (fetchErr || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
      return NextResponse.json({ error: 'Subtopic planning is only for llm_v1 pipeline' }, { status: 400 });
    }

    const plannerModel =
      process.env.TOPIC_SEARCH_PLANNER_MODEL?.trim() || 'openai/gpt-4o-mini';

    const prompt = `You help break a research topic into subtopics. Main topic: "${search.query}"

Return ONLY valid JSON: {"subtopics": string[]} with exactly 5 distinct, specific subtopics (short phrases, 2-8 words each) that together cover the landscape for content research. No numbering in strings.`;

    const ai = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      feature: 'topic_search',
      userId: user.id,
      userEmail: user.email ?? undefined,
      modelPreference: [plannerModel],
    });

    const parsed = plannerOutputSchema.parse(parseAIResponseJSON<unknown>(ai.text));
    return NextResponse.json({
      subtopics: parsed.subtopics.slice(0, 5),
      tokens_used: ai.usage.totalTokens,
    });
  } catch (e) {
    console.error('POST /plan-subtopics:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
