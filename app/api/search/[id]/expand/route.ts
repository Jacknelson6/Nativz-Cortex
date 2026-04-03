import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { z } from 'zod';

const expansionSchema = z.object({
  topic: z.string(),
  angle: z.string(),
  searchQuery: z.string(),
});

const responseSchema = z.object({
  suggestions: z.array(expansionSchema),
});

/**
 * POST /api/search/[id]/expand
 *
 * Generate related/expanded topic suggestions from a completed search.
 * Uses the search query, trending topics, and AI summary to suggest
 * adjacent research directions.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID
 * @returns { suggestions: { topic, angle, searchQuery }[] }
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search;

    if (search.status !== 'completed') {
      return NextResponse.json(
        { error: 'Search must be completed before expanding topics' },
        { status: 400 }
      );
    }

    // Build context from search results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trendingTopics = (search.trending_topics as any[]) ?? [];
    const topTopicNames = trendingTopics
      .slice(0, 8)
      .map((t) => t.name ?? t.topic ?? '')
      .filter(Boolean);

    const summary = search.summary ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiResponse = search.raw_ai_response as Record<string, any> | null;
    const brandNotes = aiResponse?.brand_alignment_notes ?? '';

    const prompt = `You are a topic research strategist for a marketing agency. A search was just completed and you need to suggest 6-8 related topics that would complement this research.

## Original search
Query: "${search.query}"

## Summary
${summary}

${brandNotes ? `## Brand alignment notes\n${brandNotes}\n` : ''}
## Top trending topics found
${topTopicNames.length > 0 ? topTopicNames.map((t) => `- ${t}`).join('\n') : 'No trending topics extracted.'}

## Your task
Suggest 6-8 related/expanded topics for further research. Think about:
- Deeper dives into the most interesting subtopics
- Competitor or alternative angles
- Audience segments worth exploring separately
- Trending adjacent topics that connect to this space
- Content format opportunities (e.g. "best [topic] TikTok formats")
- Seasonal or timely angles

For each suggestion, provide:
1. **topic** — A concise topic name (2-6 words)
2. **angle** — Why this topic is relevant and worth researching (1 sentence)
3. **searchQuery** — A ready-to-use search query optimized for research (can be different from the topic name)

Respond with JSON only, no markdown fences:
{
  "suggestions": [
    { "topic": "...", "angle": "...", "searchQuery": "..." }
  ]
}`;

    const aiResult = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      feature: 'topic_expansion',
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const parsed = parseAIResponseJSON<{ suggestions: { topic: string; angle: string; searchQuery: string }[] }>(aiResult.text);
    const validated = responseSchema.parse(parsed);

    return NextResponse.json(validated);
  } catch (error) {
    console.error('POST /api/search/[id]/expand error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
