import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { getIdeasModelFromDb } from '@/lib/ai/provider-keys';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getBrandProfile, getKnowledgeEntries } from '@/lib/knowledge/queries';
import { quickScrapeUrl } from '@/lib/knowledge/scraper';
import { getHookContext } from '@/lib/hooks/get-hook-context';

const generateSchema = z.object({
  client_id: z.string().uuid().optional(),
  url: z.string().url().optional(),
  concept: z.string().optional(),
  count: z.number().min(1).max(200).default(10),
  reference_video_ids: z.array(z.string().uuid()).optional(),
  search_id: z.string().uuid().optional(),
  pillar_ids: z.array(z.string().uuid()).optional(),
  ideas_per_pillar: z.number().min(1).max(20).optional(),
}).refine((d) => d.client_id || d.url || d.search_id, {
  message: 'Either client_id, url, or search_id is required',
});

export interface GeneratedIdeaResult {
  title: string;
  why_it_works: string[];
  content_pillar: string;
  pillar_id?: string;
}

export const maxDuration = 120;

/**
 * POST /api/ideas/generate
 *
 * Start an asynchronous AI idea generation job. Returns a generation ID immediately;
 * the actual generation runs in the background via Next.js `after()`. Supports three modes:
 * client-based (uses brand profile, strategy, past searches), URL-based (scrapes website),
 * and search-based (uses research SERP data). For pillar-based generation, makes one AI
 * call per pillar to produce focused, on-pillar ideas.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID for brand context (required unless url or search_id provided)
 * @body url - Website URL to scrape for brand context (alternative to client_id)
 * @body concept - Optional concept direction to guide generation
 * @body count - Number of ideas to generate (1-200, default: 10)
 * @body reference_video_ids - Array of reference video UUIDs to inspire style
 * @body search_id - Topic search UUID to ground ideas in research data
 * @body pillar_ids - Array of content pillar UUIDs for pillar-based generation
 * @body ideas_per_pillar - Number of ideas per pillar (1-20, required with pillar_ids)
 * @returns {{ id: string, status: 'processing' }} Generation record ID for polling
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { client_id, url, concept, count, reference_video_ids, search_id, pillar_ids, ideas_per_pillar } = parsed.data;
  const admin = createAdminClient();

  // ── Create generation record ──
  const { data: generation, error: createError } = await admin
    .from('idea_generations')
    .insert({
      client_id: client_id ?? null,
      source_url: url ?? null,
      concept: concept ?? null,
      count,
      reference_video_ids: reference_video_ids ?? [],
      search_id: search_id ?? null,
      pillar_ids: pillar_ids ?? null,
      ideas_per_pillar: ideas_per_pillar ?? null,
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

  // ── Return immediately, process in background ──
  after(async () => {
    await processGeneration({ generationId, client_id, url, concept, count, reference_video_ids, search_id, pillar_ids, ideas_per_pillar, userId: user.id, userEmail: user.email ?? undefined });
  });

  return NextResponse.json({ id: generationId, status: 'processing' });
}

// ── Background processing ──────────────────────────────────────────────────

async function processGeneration({
  generationId,
  client_id,
  url,
  concept,
  count,
  reference_video_ids,
  search_id,
  pillar_ids,
  ideas_per_pillar,
  userId,
  userEmail,
}: {
  generationId: string;
  client_id?: string;
  url?: string;
  concept?: string;
  count: number;
  reference_video_ids?: string[];
  search_id?: string;
  pillar_ids?: string[];
  ideas_per_pillar?: number;
  userId: string;
  userEmail?: string;
}) {
  const admin = createAdminClient();
  const ideasModelId = (await getIdeasModelFromDb()).trim();
  const ideasModelPreference = ideasModelId ? [ideasModelId] : undefined;

  try {
    // ── Build context blocks ──
    const contextBlocks: string[] = [];

    // ── URL-based scraping mode ──
    if (url && !client_id) {
      const scraped = await quickScrapeUrl(url);
      if (!scraped) {
        await admin.from('idea_generations').update({ status: 'failed', error_message: 'Could not scrape the provided URL' }).eq('id', generationId);
        return;
      }
      contextBlocks.push(`<brand_from_url>\nSource: ${url}\nSite: ${scraped.title}\n\n${scraped.content}\n</brand_from_url>`);
    }

    // ── Search-only mode (no client, no url) ──
    if (search_id && !client_id && !url) {
      const { data: searchData } = await admin
        .from('topic_searches')
        .select('query, summary, trending_topics, serp_data, raw_ai_response')
        .eq('id', search_id)
        .single();

      if (searchData) {
        const searchContext: string[] = [`Search query: ${searchData.query}`];
        if (searchData.summary) searchContext.push(`Research summary: ${searchData.summary}`);

        if (Array.isArray(searchData.trending_topics)) {
          const topics = (searchData.trending_topics as { name: string; resonance?: string; sentiment?: string }[])
            .map((t) => `- ${t.name} (resonance: ${t.resonance ?? 'unknown'}, sentiment: ${t.sentiment ?? 'unknown'})`)
            .join('\n');
          searchContext.push(`Trending topics:\n${topics}`);
        }

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
      }
    }

    // ── Client-based context gathering ──
    let savedIdeas: { title: string }[] = [];
    let rejectedIdeas: { title: string; description: string | null }[] = [];
    let referenceVideos: { title: string | null; transcript: unknown; visual_analysis: unknown }[] = [];

    if (client_id) {
      const [
        brandProfile,
        clientRecord,
        topicSearches,
        latestStrategy,
        savedIdeasResult,
        rejectedIdeasResult,
        referenceVideosResult,
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
        search_id
          ? admin
              .from('topic_searches')
              .select('query, summary, trending_topics, serp_data, raw_ai_response')
              .eq('id', search_id)
              .single()
              .then(({ data }) => data)
          : Promise.resolve(null),
      ]);

      savedIdeas = savedIdeasResult;
      rejectedIdeas = rejectedIdeasResult;
      referenceVideos = referenceVideosResult;

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

      if (searchData) {
        const searchContext: string[] = [`Search query: ${searchData.query}`];
        if (searchData.summary) searchContext.push(`Research summary: ${searchData.summary}`);

        if (Array.isArray(searchData.trending_topics)) {
          const topics = (searchData.trending_topics as { name: string; resonance?: string; sentiment?: string }[])
            .map((t) => `- ${t.name} (resonance: ${t.resonance ?? 'unknown'}, sentiment: ${t.sentiment ?? 'unknown'})`)
            .join('\n');
          searchContext.push(`Trending topics:\n${topics}`);
        }

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
    const hasSearch = contextBlocks.some((b) => b.includes('<research_data>'));
    const hasUrlSource = !!url && !client_id;

    // ── Hook templates + scraped hooks context ──
    const hookContext = await getHookContext({ searchId: search_id, maxTemplates: 30 });
    if (hookContext) {
      contextBlocks.push(hookContext);
    }

    // ── Pillar-based generation (one AI call per pillar) ──
    if (pillar_ids?.length && ideas_per_pillar && client_id) {
      const { data: pillars } = await admin
        .from('content_pillars')
        .select('id, name, description, emoji, example_series, hooks')
        .in('id', pillar_ids)
        .order('sort_order');

      if (!pillars?.length) {
        await admin.from('idea_generations').update({ status: 'failed', error_message: 'No pillars found' }).eq('id', generationId);
        return;
      }

      const allIdeas: GeneratedIdeaResult[] = [];
      let totalTokens = 0;
      let totalCost = 0;

      for (const pillar of pillars) {
        const pillarContext = [
          ...contextBlocks,
          `<pillar id="${pillar.id}">\nName: ${pillar.name}\nDescription: ${pillar.description ?? ''}\nExample series: ${(pillar.example_series ?? []).join(', ')}\nHooks: ${(pillar.hooks ?? []).join(' | ')}\n</pillar>`,
        ];

        if (allIdeas.length > 0) {
          pillarContext.push(`<already_generated_avoid_repeating>\n${allIdeas.map((i) => `- ${i.title}`).join('\n')}\n</already_generated_avoid_repeating>`);
        }

        const pillarPrompt = `You are a creative video content strategist for a marketing agency. Generate exactly ${ideas_per_pillar} unique short-form video ideas for the content pillar "${pillar.name}" as a JSON array.

Each idea must have these fields:
- "title": a compelling video title that a videographer can immediately understand
- "why_it_works": an array of exactly 3 short bullet points (strings). Each under 10 words.
- "content_pillar": "${pillar.name}"
- "pillar_id": "${pillar.id}"

Requirements:
- All ideas must be short-form video content (TikTok, Reels, Shorts)
- Ideas must be actionable — a videographer should know what to film
- Ideas MUST fit within the "${pillar.name}" pillar: ${pillar.description ?? ''}
- Align with the brand voice and target audience
- Do NOT repeat any already-generated ideas
- Each idea must be distinct
${hasReferences ? '- Draw inspiration from the reference videos' : ''}
${hasSearch ? '- Use the research data to ground ideas in real trends' : ''}
${hookContext ? '- Use the hook templates and trending hooks as inspiration for opening lines and video concepts. Adapt proven hook patterns to this brand and pillar.' : ''}

Output ONLY the JSON array. No other text.`;

        const result = await createCompletion({
          messages: [
            { role: 'system', content: pillarPrompt },
            { role: 'user', content: pillarContext.join('\n\n') },
          ],
          maxTokens: 4000,
          feature: 'idea_generation',
          userId,
          userEmail,
          modelPreference: ideasModelPreference,
        });

        const pillarIdeas = parseAIResponseJSON<GeneratedIdeaResult[]>(result.text)
          .slice(0, ideas_per_pillar)
          .map((idea) => ({ ...idea, pillar_id: pillar.id, content_pillar: pillar.name }));

        allIdeas.push(...pillarIdeas);
        totalTokens += result.usage.totalTokens;
        totalCost += result.estimatedCost;
      }

      await admin
        .from('idea_generations')
        .update({
          ideas: allIdeas,
          status: 'completed',
          tokens_used: totalTokens,
          estimated_cost: totalCost,
          completed_at: new Date().toISOString(),
        })
        .eq('id', generationId);
      return;
    }

    // ── Standard generation (no pillars) ──
    const systemPrompt = `You are a creative video content strategist for a marketing agency. Generate exactly ${count} unique short-form video ideas as a JSON array.

Each idea must have these fields:
- "title": a compelling video title that a videographer can immediately understand (e.g. "Top 10 reasons you should buy a home in 2026")
- "why_it_works": an array of exactly 3 short bullet points (strings). Each bullet should be a concise, punchy one-liner — like a list of pros. Keep each under 10 words. Example: ["Taps into trending home-buying conversation", "Creates urgency with 2026 angle", "Listicle format drives high watch time"]
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
${hasUrlSource ? '- The brand context was scraped from their website. Infer the industry, target audience, and brand voice from the content. Focus ideas on what would work for THIS specific business.' : ''}
${hookContext ? '- Use the hook templates and trending hooks as inspiration for opening lines and video concepts. Adapt proven hook patterns to fit this brand and audience.' : ''}

Output ONLY the JSON array. No other text.`;

    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 8000,
      feature: 'idea_generation',
      userId,
      userEmail,
      modelPreference: ideasModelPreference,
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
  } catch (err) {
    console.error('Idea generation error:', err);

    await admin
      .from('idea_generations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', generationId);
  }
}
