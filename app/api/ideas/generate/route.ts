import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getBrandProfile, getKnowledgeEntries } from '@/lib/knowledge/queries';

const generateSchema = z.object({
  client_id: z.string().uuid(),
  concept: z.string().optional(),
  count: z.number().min(1).max(50).default(10),
  reference_video_ids: z.array(z.string().uuid()).optional(),
  search_id: z.string().uuid().optional(),
});

export interface GeneratedIdeaResult {
  title: string;
  why_it_works: string;
  content_pillar: string;
}

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { client_id, concept, count, reference_video_ids, search_id } = parsed.data;
  const admin = createAdminClient();

  // ── Create generation record ──
  const { data: generation, error: createError } = await admin
    .from('idea_generations')
    .insert({
      client_id,
      concept: concept ?? null,
      count,
      reference_video_ids: reference_video_ids ?? [],
      search_id: search_id ?? null,
      status: 'processing',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (createError || !generation) {
    console.error('Failed to create generation record:', createError);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }

  const generationId = generation.id;

  // ── Gather context in parallel ──
  const [
    brandProfile,
    clientRecord,
    topicSearches,
    latestStrategy,
    savedIdeas,
    rejectedIdeas,
    referenceVideos,
    searchData,
  ] = await Promise.all([
    getBrandProfile(client_id),
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, preferences')
      .eq('id', client_id)
      .maybeSingle()
      .then(({ data }) => data),
    admin
      .from('topic_searches')
      .select('query, summary, trending_topics')
      .eq('client_id', client_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => data ?? []),
    admin
      .from('client_strategies')
      .select('content_pillars, executive_summary')
      .eq('client_id', client_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data),
    getKnowledgeEntries(client_id, 'idea'),
    admin
      .from('rejected_ideas')
      .select('title, description')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => data ?? []),
    reference_video_ids?.length
      ? admin
          .from('reference_videos')
          .select('title, transcript, visual_analysis')
          .in('id', reference_video_ids)
          .eq('status', 'completed')
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    // Fetch linked search data if search_id provided
    search_id
      ? admin
          .from('topic_searches')
          .select('query, summary, trending_topics, serp_data, raw_ai_response')
          .eq('id', search_id)
          .single()
          .then(({ data }) => data)
      : Promise.resolve(null),
  ]);

  // ── Build context blocks ──
  const contextBlocks: string[] = [];

  if (clientRecord) {
    contextBlocks.push(
      `<brand>
Name: ${clientRecord.name ?? ''}
Industry: ${clientRecord.industry ?? ''}
Target audience: ${clientRecord.target_audience ?? ''}
Brand voice: ${clientRecord.brand_voice ?? ''}
Topic keywords: ${Array.isArray(clientRecord.topic_keywords) ? (clientRecord.topic_keywords as string[]).join(', ') : clientRecord.topic_keywords ?? ''}
</brand>`,
    );
  }

  if (brandProfile) {
    contextBlocks.push(`<brand_profile>\n${brandProfile.content ?? ''}\n</brand_profile>`);
  }

  if (latestStrategy) {
    contextBlocks.push(
      `<strategy>
Content pillars: ${latestStrategy.content_pillars ? JSON.stringify(latestStrategy.content_pillars) : 'none'}
Executive summary: ${(latestStrategy.executive_summary as string) ?? ''}
</strategy>`,
    );
  }

  // Search research data (high value context when coming from topic search)
  if (searchData) {
    const searchContext: string[] = [`Search query: ${searchData.query}`];
    if (searchData.summary) searchContext.push(`Research summary: ${searchData.summary}`);

    // Extract trending topics
    if (Array.isArray(searchData.trending_topics)) {
      const topics = (searchData.trending_topics as { name: string; resonance?: string; sentiment?: string }[])
        .map((t) => `- ${t.name} (resonance: ${t.resonance ?? 'unknown'}, sentiment: ${t.sentiment ?? 'unknown'})`)
        .join('\n');
      searchContext.push(`Trending topics:\n${topics}`);
    }

    // Extract key findings from AI response
    const aiResponse = searchData.raw_ai_response as Record<string, unknown> | null;
    if (aiResponse?.key_findings) {
      searchContext.push(`Key findings: ${JSON.stringify(aiResponse.key_findings)}`);
    }
    if (aiResponse?.content_breakdown) {
      searchContext.push(`Content breakdown: ${JSON.stringify(aiResponse.content_breakdown)}`);
    }
    if (aiResponse?.action_items) {
      searchContext.push(`Action items: ${JSON.stringify(aiResponse.action_items)}`);
    }

    contextBlocks.push(`<research_data>\n${searchContext.join('\n\n')}\n</research_data>`);
  } else if (topicSearches.length > 0) {
    const summaries = topicSearches
      .map((s) => `- ${s.query}: ${(s.summary as string) ?? ''}`)
      .join('\n');
    contextBlocks.push(`<past_research>\n${summaries}\n</past_research>`);
  }

  // Reference video context
  if (referenceVideos.length > 0) {
    const refBlocks = referenceVideos.map((v, i) => {
      const analysis = v.visual_analysis as Record<string, unknown> | null;
      const parts: string[] = [`Reference video ${i + 1}: ${v.title ?? 'Untitled'}`];
      if (v.transcript) parts.push(`Transcript: ${(v.transcript as string).substring(0, 2000)}`);
      if (analysis) {
        if (analysis.summary) parts.push(`Summary: ${analysis.summary}`);
        if (analysis.contentStructure) parts.push(`Structure: ${JSON.stringify(analysis.contentStructure)}`);
        if (Array.isArray(analysis.elements)) {
          const highPriority = (analysis.elements as { element: string; description: string; priority: string }[])
            .filter((e) => e.priority === 'high')
            .map((e) => `  - [${e.priority.toUpperCase()}] ${e.element}: ${e.description}`);
          if (highPriority.length > 0) parts.push(`Key elements:\n${highPriority.join('\n')}`);
        }
        if (analysis.overallStyle) parts.push(`Style: ${analysis.overallStyle}`);
      }
      return parts.join('\n');
    }).join('\n\n');
    contextBlocks.push(`<reference_videos>\n${refBlocks}\n</reference_videos>`);
  }

  if (savedIdeas.length > 0) {
    contextBlocks.push(
      `<saved_ideas_avoid_repeating>\n${savedIdeas.map((i) => `- ${i.title}`).join('\n')}\n</saved_ideas_avoid_repeating>`,
    );
  }

  if (rejectedIdeas.length > 0) {
    contextBlocks.push(
      `<rejected_ideas_do_not_suggest_similar>\n${rejectedIdeas.map((i) => `- ${i.title}: ${i.description ?? ''}`).join('\n')}\n</rejected_ideas_do_not_suggest_similar>`,
    );
  }

  if (concept) {
    contextBlocks.push(`<concept_direction>\n${concept}\n</concept_direction>`);
  }

  const hasReferences = referenceVideos.length > 0;
  const hasSearch = !!searchData;

  const systemPrompt = `You are a creative video content strategist for a marketing agency. Generate exactly ${count} unique short-form video ideas as a JSON array.

Each idea must have these fields:
- "title": a compelling video title that a videographer can immediately understand (e.g. "Top 10 reasons you should buy a home in 2026")
- "why_it_works": 2-3 sentences explaining why this is a good idea, why it would perform well, and what makes it compelling for the target audience
- "content_pillar": the content category/pillar this falls under

Requirements:
- All ideas must be short-form video content (TikTok, Reels, Shorts)
- Ideas must be actionable — a videographer should know what to film
- Align with the brand voice and target audience
- Do NOT repeat any existing saved ideas
- Do NOT suggest anything similar to the rejected ideas — those patterns didn't work
- Each idea must be distinct from the others
${hasReferences ? '- Draw heavy inspiration from the reference videos — match their style, energy, and content approach while adapting for this brand' : ''}
${hasSearch ? '- Use the research data heavily — base ideas on what is actually trending and performing well. Ground ideas in real data, not assumptions.' : ''}

Output ONLY the JSON array. No other text.`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 6000,
      feature: 'idea_generation',
    });

    const ideas = parseAIResponseJSON<GeneratedIdeaResult[]>(result.text).slice(0, count);

    // Persist results
    await admin
      .from('idea_generations')
      .update({
        ideas,
        status: 'completed',
        tokens_used: result.usage.totalTokens,
        estimated_cost: result.estimatedCost,
        completed_at: new Date().toISOString(),
      })
      .eq('id', generationId);

    return NextResponse.json({
      id: generationId,
      ideas,
      usage: result.usage,
      estimatedCost: result.estimatedCost,
    });
  } catch (err) {
    console.error('Idea generation error:', err);

    // Mark as failed
    await admin
      .from('idea_generations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', generationId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate ideas' },
      { status: 500 },
    );
  }
}
