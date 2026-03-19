import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getBrandProfile, getKnowledgeEntries } from '@/lib/knowledge/queries';
import { getBrandContext } from '@/lib/knowledge/brand-context';

const generateSchema = z.object({
  count: z.number().min(1).max(10).default(5),
  direction: z.string().optional(),
});

interface GeneratedPillar {
  name: string;
  description: string;
  emoji: string;
  example_series: string[];
  formats: string[];
  hooks: string[];
  frequency: string;
}

export const maxDuration = 120;

/**
 * POST /api/clients/[id]/pillars/generate
 *
 * Kick off an async AI generation of content pillars for a client. Creates a generation
 * record immediately and returns its ID, then processes in background via after().
 * Poll GET /api/clients/[id]/pillars/generate/[generationId] for status.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @body count - Number of pillars to generate (default: 5, min: 1, max: 10)
 * @body direction - Optional natural language direction to guide generation
 * @returns {{ id: string, status: 'processing' }} Generation record ID for polling
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { count, direction } = parsed.data;
  const admin = createAdminClient();

  // Create generation record
  const { data: generation, error: createError } = await admin
    .from('pillar_generations')
    .insert({
      client_id: id,
      count,
      direction: direction ?? null,
      status: 'processing',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (createError || !generation) {
    console.error('Failed to create pillar generation record:', createError);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }

  const generationId = generation.id;

  // Return immediately, process in background
  after(async () => {
    await processGeneration({ generationId, clientId: id, count, direction });
  });

  return NextResponse.json({ id: generationId, status: 'processing' });
}

// ── Background processing ──────────────────────────────────────────────────

async function processGeneration({
  generationId,
  clientId,
  count,
  direction,
}: {
  generationId: string;
  clientId: string;
  count: number;
  direction?: string;
}) {
  const admin = createAdminClient();

  try {
    // Try Brand DNA first for unified context
    let brandDNABlock: string | null = null;
    try {
      const brandDNA = await getBrandContext(clientId);
      if (brandDNA.fromGuideline) {
        brandDNABlock = brandDNA.toPromptBlock();
      }
    } catch {
      // Non-blocking — fall back to legacy
    }

    // Fetch remaining context in parallel
    const [clientRecord, brandProfile, knowledgeEntries, existingPillars] = await Promise.all([
      admin
        .from('clients')
        .select('name, industry, target_audience, brand_voice, topic_keywords')
        .eq('id', clientId)
        .maybeSingle()
        .then(({ data }) => data),
      brandDNABlock ? Promise.resolve(null) : getBrandProfile(clientId),
      brandDNABlock ? Promise.resolve([]) : getKnowledgeEntries(clientId),
      admin
        .from('content_pillars')
        .select('name')
        .eq('client_id', clientId)
        .then(({ data }) => data ?? []),
    ]);

    // Build context blocks
    const contextBlocks: string[] = [];

    if (brandDNABlock) {
      // Brand DNA provides comprehensive brand context
      contextBlocks.push(brandDNABlock);
    } else {
      // Legacy fallback
      if (clientRecord) {
        contextBlocks.push(
          `<brand>
Name: ${clientRecord.name ?? ''}
Industry: ${clientRecord.industry ?? ''}
Target audience: ${clientRecord.target_audience ?? ''}
Brand voice: ${clientRecord.brand_voice ?? ''}
Topic keywords: ${Array.isArray(clientRecord.topic_keywords) ? (clientRecord.topic_keywords as string[]).join(', ') : clientRecord.topic_keywords ?? ''}
</brand>`
        );
      }

      if (brandProfile) {
        contextBlocks.push(`<brand_profile>\n${brandProfile.content ?? ''}\n</brand_profile>`);
      }

      if (knowledgeEntries.length > 0) {
        const summaries = knowledgeEntries
          .slice(0, 20)
          .map((e) => `- [${e.type}] ${e.title}: ${(e.content ?? '').slice(0, 200)}`)
          .join('\n');
        contextBlocks.push(`<knowledge_base>\n${summaries}\n</knowledge_base>`);
      }
    }

    const existingNames = existingPillars.map((p) => p.name as string);
    if (existingNames.length > 0) {
      contextBlocks.push(`<existing_pillars_avoid_duplicates>\n${existingNames.map((n) => `- ${n}`).join('\n')}\n</existing_pillars_avoid_duplicates>`);
    }

    if (direction) {
      contextBlocks.push(`<direction>\n${direction}\n</direction>`);
    }

    const systemPrompt = `You are a content strategist for a marketing agency. Generate exactly ${count} unique content pillars as a JSON array. Each pillar: { name, description (2-3 sentences), emoji (single emoji), example_series (3 recurring series names), formats (content formats), hooks (3 opening lines), frequency }. Requirements: each pillar must be distinct, cover different aspects of the brand, align with target audience. Do NOT duplicate existing pillars. Output ONLY the JSON array.`;

    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 8000,
      feature: 'pillar_generation',
    });

    const pillars = parseAIResponseJSON<GeneratedPillar[]>(result.text).slice(0, count);

    // Get current max sort_order
    const { data: maxRow } = await admin
      .from('content_pillars')
      .select('sort_order')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const startOrder = (maxRow?.sort_order ?? -1) + 1;

    // Insert all pillars
    const pillarRows = pillars.map((p, i) => ({
      client_id: clientId,
      name: p.name ?? '',
      description: p.description ?? '',
      emoji: p.emoji ?? '',
      example_series: p.example_series ?? [],
      formats: p.formats ?? [],
      hooks: p.hooks ?? [],
      frequency: p.frequency ?? '',
      sort_order: startOrder + i,
      generation_id: generationId,
      created_by: null as string | null,
    }));

    const { error: insertError } = await admin
      .from('content_pillars')
      .insert(pillarRows);

    if (insertError) {
      throw new Error(`Failed to insert pillars: ${insertError.message}`);
    }

    // Update generation to completed
    await admin
      .from('pillar_generations')
      .update({
        status: 'completed',
        tokens_used: result.usage.totalTokens,
        estimated_cost: result.estimatedCost,
        completed_at: new Date().toISOString(),
      })
      .eq('id', generationId);
  } catch (err) {
    console.error('Pillar generation error:', err);

    await admin
      .from('pillar_generations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', generationId);
  }
}
