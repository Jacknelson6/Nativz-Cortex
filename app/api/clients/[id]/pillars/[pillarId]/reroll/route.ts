import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getBrandProfile } from '@/lib/knowledge/queries';

const rerollSchema = z.object({
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; pillarId: string }> }
) {
  const { id, pillarId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = rerollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { direction } = parsed.data;
  const admin = createAdminClient();

  // Fetch sibling pillars (all except the one being rerolled)
  const { data: allPillars, error: pillarsError } = await admin
    .from('content_pillars')
    .select('*')
    .eq('client_id', id);

  if (pillarsError) {
    console.error('Failed to fetch pillars:', pillarsError);
    return NextResponse.json({ error: 'Failed to fetch pillars' }, { status: 500 });
  }

  const currentPillar = (allPillars ?? []).find((p) => p.id === pillarId);
  if (!currentPillar) {
    return NextResponse.json({ error: 'Pillar not found' }, { status: 404 });
  }

  const siblingNames = (allPillars ?? [])
    .filter((p) => p.id !== pillarId)
    .map((p) => p.name as string);

  // Fetch brand context
  const [clientRecord, brandProfile] = await Promise.all([
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => data),
    getBrandProfile(id),
  ]);

  // Build context blocks
  const contextBlocks: string[] = [];

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

  if (direction) {
    contextBlocks.push(`<direction>\n${direction}\n</direction>`);
  }

  if (siblingNames.length > 0) {
    contextBlocks.push(`<existing_pillars>\n${siblingNames.map((n) => `- ${n}`).join('\n')}\n</existing_pillars>`);
  }

  const systemPrompt = `Generate exactly 1 content pillar for a marketing agency client. Output ONLY a JSON object with fields: name, description (2-3 sentences), emoji (single emoji), example_series (array of 3 recurring series names), formats (array of content formats like video/carousel/story), hooks (array of 3 attention-grabbing opening lines), frequency (posting frequency like '2-3x per week'). Do NOT duplicate these existing pillars: [${siblingNames.join(', ')}]. Make it distinct and complementary.`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 2000,
      feature: 'pillar_reroll',
    });

    const generated = parseAIResponseJSON<GeneratedPillar>(result.text);

    // Update existing pillar in place (preserve id and sort_order)
    const { data: pillar, error: updateError } = await admin
      .from('content_pillars')
      .update({
        name: generated.name ?? '',
        description: generated.description ?? '',
        emoji: generated.emoji ?? '',
        example_series: generated.example_series ?? [],
        formats: generated.formats ?? [],
        hooks: generated.hooks ?? [],
        frequency: generated.frequency ?? '',
      })
      .eq('id', pillarId)
      .eq('client_id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update pillar after reroll:', updateError);
      return NextResponse.json({ error: 'Failed to update pillar' }, { status: 500 });
    }

    return NextResponse.json({ pillar });
  } catch (err) {
    console.error('Pillar reroll error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to regenerate pillar' },
      { status: 500 }
    );
  }
}
