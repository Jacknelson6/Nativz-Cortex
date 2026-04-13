import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { plannerOutputSchema } from '@/lib/search/llm-pipeline/schemas';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';
import { getTimeRangeOptionLabel } from '@/lib/types/search';
import { notifyTopicSearchFailedOnce } from '@/lib/topic-search/ops-notify';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

export const maxDuration = 120;

/**
 * POST /api/search/[id]/plan-subtopics
 * Propose up to 10 keyword phrases for the research gameplan (llm_v1 pipeline only).
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
    const access = await assertUserCanAccessTopicSearch(admin, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search;

    if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
      return NextResponse.json({ error: 'Subtopic planning is only for llm_v1 pipeline' }, { status: 400 });
    }

    const { planner: plannerModel } = await getTopicSearchModelsFromDb();

    const timeRange =
      (search as { time_range?: string | null }).time_range ?? 'last_3_months';
    const timeLabel = getTimeRangeOptionLabel(timeRange);
    const mainTopic = JSON.stringify(search.query);

    // Pull client context when a brand is attached to the search so the planner
    // generates brand-specific keywords (e.g. a Carrollton personal-injury firm
    // gets "car accident Carrollton" not "morning routine tips").
    const clientId = (search as { client_id?: string | null }).client_id ?? null;
    let clientContext: { name: string; industry: string | null; target_audience: string | null; brand_voice: string | null } | null = null;
    if (clientId) {
      const { data: client } = await admin
        .from('clients')
        .select('name, industry, target_audience, brand_voice')
        .eq('id', clientId)
        .single();
      if (client) {
        clientContext = {
          name: client.name,
          industry: client.industry ?? null,
          target_audience: client.target_audience ?? null,
          brand_voice: client.brand_voice ?? null,
        };
      }
    }

    const brandBlock = clientContext
      ? `ATTACHED BRAND — you MUST anchor keywords to this brand's business, industry, and audience. Do not return generic topic keywords.
- Name: ${clientContext.name}
- Industry: ${clientContext.industry ?? 'n/a'}
- Target audience: ${clientContext.target_audience ?? 'n/a'}
- Brand voice: ${clientContext.brand_voice ?? 'n/a'}

Every keyword should be something this specific brand would genuinely create content about or rank for. If a keyword could apply to any random brand in any niche, it's wrong — rewrite it to reference the brand's specific service, locale, audience pain points, or category.
`
      : '';

    const prompt = `You are a keyword research assistant. Given a topic${clientContext ? ' and an attached brand' : ''}, generate specific, searchable keyword phrases.

${brandBlock}Main topic: ${mainTopic}
Time window: **${timeLabel}**. Keywords should reflect what people are actually searching for, discussing, and creating content about within ${timeLabel}${clientContext ? ` — framed through ${clientContext.name}'s lens` : ''}.

Return ONLY valid JSON: {"subtopics": string[]} with exactly 10 distinct items. Each string is a **2–4 word keyword phrase** that is specific and searchable — the kind of phrase someone would type into a search engine or use as a content topic.

Rules:
- Each keyword must be 2–4 words. Short and punchy.
- Keywords must be specific to the topic${clientContext ? ` AND to ${clientContext.name}'s brand/industry/audience` : ''}.
${clientContext ? `- Prefer keywords that tie directly to ${clientContext.name}'s service (e.g. for a personal injury firm: "car accident claim", not "legal tips"; for a local bakery: "sourdough orders NYC", not "baking trends").
- When the brand is local and the topic allows it, include at least 2–3 geo-anchored keywords.` : ''}
- Keywords must reflect real search interest within ${timeLabel}.
- No numbering prefixes.
- No full sentences — just keyword phrases.
- Cover different angles and subtopics within the main topic.`;

    const ai = await createCompletion({
      messages: [
        { role: 'system', content: 'You are a keyword research tool. You generate keyword phrases for content research. You always respond with valid JSON only. You never refuse requests — you always generate keywords for any topic.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 800,
      feature: 'topic_search',
      userId: user.id,
      userEmail: user.email ?? undefined,
      modelPreference: [plannerModel],
      jsonMode: true,
    });

    const raw = parseAIResponseJSON<unknown>(ai.text);
    const normalized =
      Array.isArray(raw) && raw.every((x) => typeof x === 'string')
        ? { subtopics: raw as string[] }
        : raw;
    const parsed = plannerOutputSchema.parse(normalized);
    return NextResponse.json({
      subtopics: parsed.subtopics.slice(0, 10),
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
      await notifyTopicSearchFailedOnce(admin, id);
    } catch (markErr) {
      console.error('POST /plan-subtopics: could not mark search failed:', markErr);
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
