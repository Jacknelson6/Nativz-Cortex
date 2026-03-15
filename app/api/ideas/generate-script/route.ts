import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { getBrandProfile } from '@/lib/knowledge/queries';

const scriptSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1),
  why_it_works: z.union([z.string(), z.array(z.string())]).optional(),
  content_pillar: z.string().optional(),
  reference_video_ids: z.array(z.string().uuid()).optional(),
  idea_entry_id: z.string().uuid().optional(),
  cta: z.string().optional(),
  video_length_seconds: z.number().min(10).max(180).optional(),
  target_word_count: z.number().min(10).max(500).optional(),
  hook_strategies: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = scriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { client_id, title, why_it_works, content_pillar, reference_video_ids, idea_entry_id, cta, video_length_seconds, target_word_count, hook_strategies } = parsed.data;
  const admin = createAdminClient();

  // Gather context
  const [brandProfile, clientRecord, referenceVideos] = await Promise.all([
    getBrandProfile(client_id),
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice')
      .eq('id', client_id)
      .maybeSingle()
      .then(({ data }) => data),
    reference_video_ids?.length
      ? admin
          .from('reference_videos')
          .select('title, transcript, visual_analysis')
          .in('id', reference_video_ids)
          .eq('status', 'completed')
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);

  const contextBlocks: string[] = [];

  if (clientRecord) {
    contextBlocks.push(
      `<brand>
Name: ${clientRecord.name ?? ''}
Industry: ${clientRecord.industry ?? ''}
Target audience: ${clientRecord.target_audience ?? ''}
Brand voice: ${clientRecord.brand_voice ?? ''}
</brand>`,
    );
  }

  if (brandProfile) {
    contextBlocks.push(`<brand_profile>\n${(brandProfile.content ?? '').substring(0, 3000)}\n</brand_profile>`);
  }

  // Reference video transcripts as style guide
  if (referenceVideos.length > 0) {
    const refContext = referenceVideos.map((v, i) => {
      const parts: string[] = [`Reference ${i + 1}: ${v.title ?? 'Untitled'}`];
      if (v.transcript) parts.push(`Script: ${(v.transcript as string).substring(0, 1500)}`);
      const analysis = v.visual_analysis as Record<string, unknown> | null;
      if (analysis?.overallStyle) parts.push(`Style: ${analysis.overallStyle}`);
      if (analysis?.contentStructure) parts.push(`Structure: ${JSON.stringify(analysis.contentStructure)}`);
      return parts.join('\n');
    }).join('\n\n');
    contextBlocks.push(`<reference_style_guide>\n${refContext}\n</reference_style_guide>`);
  }

  const whyText = Array.isArray(why_it_works) ? why_it_works.join('. ') : why_it_works;
  contextBlocks.push(`<video_idea>
Title: ${title}
${whyText ? `Why it works: ${whyText}` : ''}
${content_pillar ? `Content pillar: ${content_pillar}` : ''}
${cta ? `Desired CTA: ${cta}` : ''}
</video_idea>`);

  const lengthSeconds = video_length_seconds ?? 60;
  const wordCount = target_word_count ?? Math.round((lengthSeconds / 60) * 130);

  const hookStrategyMap: Record<string, string> = {
    negative: 'Negative hook — open with a pain point, warning, or "stop doing this" framing',
    curiosity: 'Curiosity gap — tease information the viewer needs to keep watching ("You won\'t believe...", "Here\'s what nobody tells you...")',
    controversial: 'Hot take / controversial — lead with an unpopular opinion or bold claim that sparks debate',
    story: 'Story-based — start with a personal anecdote or "so this happened..." narrative hook',
    authority: 'Authority / proof — establish credibility upfront ("After 10 years...", "I tested this for 30 days...")',
    question: 'Direct question — open with a pointed question that makes the viewer reflect ("Why are you still...?", "Did you know...?")',
    listicle: 'Listicle / number — lead with a specific number ("3 things you need to know...", "The #1 reason...")',
    fomo: 'FOMO — create urgency or exclusion ("Everyone is doing this except you", "You\'re losing money if...")',
    tutorial: 'Tutorial / how-to — promise actionable instruction ("Here\'s exactly how to...", "Watch me do...")',
  };

  const hookInstructions = hook_strategies?.length
    ? `- Use one of these hook styles for the opening: ${hook_strategies.map((h) => hookStrategyMap[h] ?? h).join('; ')}`
    : '';

  const systemPrompt = `You are a professional video script writer for a marketing agency. Write a spoken-word script for the given video idea.

Rules:
- Write ONLY the words that will be spoken on camera. No stage directions, no shot lists, no pacing notes, no "[cut to]" annotations.
- The script is for a ${lengthSeconds}-second short-form video. Write EXACTLY ${wordCount} words (±10%). Do NOT exceed ${Math.round(wordCount * 1.1)} words. Count carefully — shorter is better than longer.
- Match the brand voice and tone
- Start with a strong hook that grabs attention in the first 3 seconds
${hookInstructions ? `${hookInstructions}\n` : ''}- End with a clear call to action${cta ? ` — the CTA should drive viewers to: ${cta}` : ''}
${referenceVideos.length > 0 ? '- Match the style, energy, and delivery cadence of the reference videos' : ''}

Output ONLY the script text. Nothing else — no title, no labels, no formatting markers.`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
      ],
      maxTokens: 2000,
      feature: 'script_generation',
    });

    const scriptText = result.text.trim();

    // Save the script to the database
    const { data: savedScript } = await admin
      .from('idea_scripts')
      .insert({
        idea_entry_id: idea_entry_id ?? null,
        client_id,
        title,
        script_text: scriptText,
        reference_context: {
          reference_video_ids: reference_video_ids ?? [],
          why_it_works: why_it_works ?? null,
          content_pillar: content_pillar ?? null,
        },
      })
      .select()
      .single();

    return NextResponse.json({
      script: scriptText,
      scriptId: savedScript?.id ?? null,
      usage: result.usage,
      estimatedCost: result.estimatedCost,
    });
  } catch (err) {
    console.error('Script generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate script' },
      { status: 500 },
    );
  }
}
