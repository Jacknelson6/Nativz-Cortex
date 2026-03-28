import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getBrandProfile, getKnowledgeEntries } from '@/lib/knowledge/queries';
import { generateSpokenScript } from '@/lib/ideas/spoken-script';

const strategySchema = z.object({
  direction: z.string().optional(),
  pillar_count: z.number().min(1).max(10).default(5),
  ideas_per_pillar: z.number().min(1).max(10).default(5),
});

export const maxDuration = 300;

/**
 * POST /api/clients/[id]/pillars/generate-strategy
 *
 * Run the full AI strategy pipeline in background via after(). Generates content pillars,
 * then video ideas per pillar, then spoken-word scripts — in three sequential phases.
 * Returns a pipeline run ID for polling. Replaces all existing pillars for the client.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @body direction - Optional natural language direction for generation
 * @body pillar_count - Number of pillars to generate (default: 5, min: 1, max: 10)
 * @body ideas_per_pillar - Number of ideas per pillar (default: 5, min: 1, max: 10)
 * @returns {{ id: string, status: 'processing' }} Pipeline run ID for polling
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = strategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { direction, pillar_count, ideas_per_pillar } = parsed.data;
  const admin = createAdminClient();

  // Create pillar generation record
  const { data: pillarGen } = await admin
    .from('pillar_generations')
    .insert({ client_id: clientId, count: pillar_count, direction: direction ?? null, status: 'processing', created_by: user.id })
    .select('id')
    .single();

  if (!pillarGen) {
    return NextResponse.json({ error: 'Failed to start pipeline' }, { status: 500 });
  }

  // Create pipeline run
  const { data: run, error: runError } = await admin
    .from('strategy_pipeline_runs')
    .insert({
      client_id: clientId,
      status: 'processing',
      current_phase: 'pillars',
      direction: direction ?? null,
      pillar_generation_id: pillarGen.id,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Failed to start pipeline' }, { status: 500 });
  }

  after(async () => {
    await runPipeline({ runId: run.id, clientId, pillarGenId: pillarGen.id, direction, pillar_count, ideas_per_pillar, userId: user.id });
  });

  return NextResponse.json({ id: run.id, status: 'processing' });
}

// ── Pipeline processing ──

interface PillarResult {
  name: string;
  description: string;
  emoji: string;
  example_series: string[];
  formats: string[];
  hooks: string[];
  frequency: string;
}

async function runPipeline({
  runId,
  clientId,
  pillarGenId,
  direction,
  pillar_count,
  ideas_per_pillar,
  userId,
}: {
  runId: string;
  clientId: string;
  pillarGenId: string;
  direction?: string;
  pillar_count: number;
  ideas_per_pillar: number;
  userId: string;
}) {
  const admin = createAdminClient();

  try {
    // ── Phase 1: Generate pillars ──
    const [brandProfile, clientRecord, knowledgeEntries] = await Promise.all([
      getBrandProfile(clientId),
      admin.from('clients').select('name, industry, target_audience, brand_voice, topic_keywords').eq('id', clientId).maybeSingle().then(({ data }) => data),
      getKnowledgeEntries(clientId),
    ]);

    const contextBlocks: string[] = [];
    if (clientRecord) {
      contextBlocks.push(`<brand>\nName: ${clientRecord.name ?? ''}\nIndustry: ${clientRecord.industry ?? ''}\nTarget audience: ${clientRecord.target_audience ?? ''}\nBrand voice: ${clientRecord.brand_voice ?? ''}\nTopic keywords: ${Array.isArray(clientRecord.topic_keywords) ? (clientRecord.topic_keywords as string[]).join(', ') : clientRecord.topic_keywords ?? ''}\n</brand>`);
    }
    if (brandProfile) {
      contextBlocks.push(`<brand_profile>\n${brandProfile.content ?? ''}\n</brand_profile>`);
    }
    if (knowledgeEntries.length > 0) {
      const entries = knowledgeEntries.slice(0, 20).map((e) => `- [${e.type}] ${e.title}`).join('\n');
      contextBlocks.push(`<knowledge_base>\n${entries}\n</knowledge_base>`);
    }
    if (direction) {
      contextBlocks.push(`<direction>\n${direction}\n</direction>`);
    }

    const pillarPrompt = `You are a content strategist for a marketing agency. Generate exactly ${pillar_count} unique content pillars as a JSON array.

Each pillar object must have: name, description (2-3 sentences), emoji (single emoji), example_series (3 recurring series names), formats (content formats like video/carousel/story), hooks (3 attention-grabbing opening lines), frequency (posting frequency).

Requirements:
- Each pillar must be distinct and cover different brand aspects
- Align with the target audience and brand voice
- Make pillars actionable for video content creation

Output ONLY the JSON array.`;

    const pillarResult = await createCompletion({
      messages: [
        { role: 'system', content: pillarPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 4000,
      feature: 'strategy_pipeline',
    });

    const pillarData = parseAIResponseJSON<PillarResult[]>(pillarResult.text).slice(0, pillar_count);

    // Delete existing pillars for this client
    await admin.from('content_pillars').delete().eq('client_id', clientId);

    // Insert new pillars
    const pillarInserts = pillarData.map((p, i) => ({
      client_id: clientId,
      name: p.name,
      description: p.description ?? null,
      emoji: p.emoji ?? null,
      example_series: p.example_series ?? [],
      formats: p.formats ?? [],
      hooks: p.hooks ?? [],
      frequency: p.frequency ?? null,
      sort_order: i,
      created_by: userId,
    }));

    const { data: insertedPillars } = await admin
      .from('content_pillars')
      .insert(pillarInserts)
      .select('id, name');

    await admin.from('pillar_generations').update({
      status: 'completed',
      tokens_used: pillarResult.usage.totalTokens,
      estimated_cost: pillarResult.estimatedCost,
      completed_at: new Date().toISOString(),
    }).eq('id', pillarGenId);

    if (!insertedPillars?.length) throw new Error('No pillars were created');

    // ── Phase 2: Generate ideas per pillar ──
    await admin.from('strategy_pipeline_runs').update({ current_phase: 'ideas' }).eq('id', runId);

    const pillarIds = insertedPillars.map((p) => p.id);
    const totalCount = pillarIds.length * ideas_per_pillar;

    const { data: ideaGen } = await admin
      .from('idea_generations')
      .insert({
        client_id: clientId,
        count: totalCount,
        pillar_ids: pillarIds,
        ideas_per_pillar,
        status: 'processing',
        created_by: userId,
      })
      .select('id')
      .single();

    if (!ideaGen) throw new Error('Failed to create idea generation');

    await admin.from('strategy_pipeline_runs').update({ idea_generation_id: ideaGen.id }).eq('id', runId);

    // Generate ideas per pillar
    const allIdeas: { title: string; why_it_works: string[]; content_pillar: string; pillar_id: string }[] = [];
    let ideaTokens = 0;
    let ideaCost = 0;

    for (const pillar of insertedPillars) {
      const pillarContext = [
        ...contextBlocks,
        `<pillar id="${pillar.id}">\nName: ${pillar.name}\n</pillar>`,
      ];

      if (allIdeas.length > 0) {
        pillarContext.push(`<already_generated>\n${allIdeas.map((i) => `- ${i.title}`).join('\n')}\n</already_generated>`);
      }

      const ideaPrompt = `Generate exactly ${ideas_per_pillar} unique short-form video ideas for the "${pillar.name}" content pillar as a JSON array.

Each idea: { "title": string, "why_it_works": [3 short bullets under 10 words each], "content_pillar": "${pillar.name}", "pillar_id": "${pillar.id}" }

All ideas must be actionable short-form video content. Output ONLY the JSON array.`;

      const ideaResult = await createCompletion({
        messages: [
          { role: 'system', content: ideaPrompt },
          { role: 'user', content: pillarContext.join('\n\n') },
        ],
        maxTokens: 4000,
        feature: 'strategy_pipeline',
      });

      const ideas = parseAIResponseJSON<typeof allIdeas>(ideaResult.text)
        .slice(0, ideas_per_pillar)
        .map((i) => ({ ...i, pillar_id: pillar.id, content_pillar: pillar.name }));

      allIdeas.push(...ideas);
      ideaTokens += ideaResult.usage.totalTokens;
      ideaCost += ideaResult.estimatedCost;
    }

    await admin.from('idea_generations').update({
      ideas: allIdeas,
      status: 'completed',
      tokens_used: ideaTokens,
      estimated_cost: ideaCost,
      completed_at: new Date().toISOString(),
    }).eq('id', ideaGen.id);

    // ── Phase 3: Generate scripts (same spoken-script path as /api/ideas/generate-script) ──
    await admin.from('strategy_pipeline_runs').update({ current_phase: 'scripts' }).eq('id', runId);

    for (const idea of allIdeas) {
      try {
        const { scriptText } = await generateSpokenScript({
          admin,
          clientId,
          title: idea.title,
          why_it_works: idea.why_it_works,
          content_pillar: idea.content_pillar,
          video_length_seconds: 60,
          userId,
        });

        await admin.from('idea_scripts').insert({
          client_id: clientId,
          title: idea.title,
          script_text: scriptText,
          reference_context: {
            pillar_id: idea.pillar_id,
            content_pillar: idea.content_pillar,
            idea_generation_id: ideaGen.id,
            pipeline: 'strategy_pipeline',
          },
        });
      } catch {
        // Continue with other scripts if one fails
      }
    }

    // ── Done ──
    await admin.from('strategy_pipeline_runs').update({
      current_phase: 'done',
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', runId);

  } catch (err) {
    console.error('Strategy pipeline error:', err);
    await admin.from('strategy_pipeline_runs').update({
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    }).eq('id', runId);
  }
}
