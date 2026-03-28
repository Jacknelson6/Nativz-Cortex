import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { plannerOutputSchema } from '@/lib/search/llm-pipeline/schemas';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';
import { getTimeRangeOptionLabel } from '@/lib/types/search';

export const maxDuration = 120;

/**
 * POST /api/search/[id]/plan-subtopics
 * Propose up to 5 research angles for the gameplan (llm_v1 pipeline only).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: search, error: fetchErr } = await admin
      .from('topic_searches')
      .select('id, query, topic_pipeline, status, time_range')
      .eq('id', id)
      .single();

    if (fetchErr || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
      return NextResponse.json({ error: 'Subtopic planning is only for llm_v1 pipeline' }, { status: 400 });
    }

    const { planner: plannerModel } = await getTopicSearchModelsFromDb();

    const timeRange =
      (search as { time_range?: string | null }).time_range ?? 'last_3_months';
    const timeLabel = getTimeRangeOptionLabel(timeRange);
    const mainTopic = JSON.stringify(search.query);

    const prompt = `You design a research gameplan—not a loose list of unrelated subtopics.

Main topic: ${mainTopic}
Time window: The user chose **${timeLabel}**. Every angle must be relevant **within ${timeLabel}** (what audiences, creators, news, and platforms have actually emphasized in that window—not timeless trivia).

Return ONLY valid JSON: {"subtopics": string[]} with exactly 5 distinct items. Each string is 2–10 words naming one **research angle or phase** in the gameplan so that, together, all five cover the full scope of the main topic **for ${timeLabel}**. Think: five tracks a strategist would run so nothing important is missed in that period.

Rules:
- Each angle must be clearly tied to **recent** conversation, trends, or questions in this window.
- No numbering prefixes in the strings.
- Do not use the word "subtopic" inside each string.`;

    const ai = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      feature: 'topic_search',
      userId: user.id,
      userEmail: user.email ?? undefined,
      modelPreference: [plannerModel],
    });

    const raw = parseAIResponseJSON<unknown>(ai.text);
    const normalized =
      Array.isArray(raw) && raw.every((x) => typeof x === 'string')
        ? { subtopics: raw as string[] }
        : raw;
    const parsed = plannerOutputSchema.parse(normalized);
    return NextResponse.json({
      subtopics: parsed.subtopics.slice(0, 5),
      tokens_used: ai.usage.totalTokens,
    });
  } catch (e) {
    console.error('POST /plan-subtopics:', e);
    try {
      const admin = createAdminClient();
      await admin
        .from('topic_searches')
        .update({ status: 'failed' })
        .eq('id', id)
        .eq('status', 'pending_subtopics');
    } catch (markErr) {
      console.error('POST /plan-subtopics: could not mark search failed:', markErr);
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
