import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { z } from 'zod';

const Schema = z.object({
  caption: z.string().default(''),
  client_id: z.string().uuid().optional(),
});

/**
 * POST /api/scheduler/ai/improve-caption
 *
 * Improve an existing caption or generate a new one from scratch using AI. Uses client
 * brand voice, saved captions/CTAs, and target audience for context. Returns only the
 * final caption text (no markdown formatting).
 *
 * @auth Required (any authenticated user)
 * @body caption - Caption to improve; omit or leave blank to generate from scratch
 * @body client_id - Client UUID for brand context and saved captions (optional)
 * @returns {{ improved_caption: string }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Fetch client context + saved captions if available
    let clientContext = '';
    let savedCaptionsContext = '';
    if (parsed.data.client_id) {
      const adminClient = createAdminClient();

      const [{ data: client }, { data: savedCaptions }] = await Promise.all([
        adminClient
          .from('clients')
          .select('name, industry, brand_voice, target_audience, topic_keywords, description, services')
          .eq('id', parsed.data.client_id)
          .single(),
        adminClient
          .from('saved_captions')
          .select('title, caption_text, hashtags')
          .eq('client_id', parsed.data.client_id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (client) {
        clientContext = `
Brand: ${client.name}
Industry: ${client.industry ?? 'General'}
Brand voice: ${client.brand_voice ?? 'Professional and engaging'}
Target audience: ${client.target_audience ?? 'General audience'}
Keywords: ${(client.topic_keywords ?? []).join(', ')}
${client.description ? `About: ${client.description}` : ''}
${(client.services ?? []).length > 0 ? `Services: ${client.services.join(', ')}` : ''}`;
      }

      if (savedCaptions && savedCaptions.length > 0) {
        const captionExamples = savedCaptions.map((sc: { title: string; caption_text: string; hashtags: string[] }) => {
          const parts = [`- "${sc.title}": ${sc.caption_text}`];
          if (sc.hashtags?.length > 0) parts.push(`  Hashtags: ${sc.hashtags.map((h: string) => `#${h}`).join(' ')}`);
          return parts.join('\n');
        }).join('\n');
        savedCaptionsContext = `

Saved CTAs & hashtag sets (use these as reference for tone, CTAs, and hashtags):
${captionExamples}`;
      }
    }

    const isGenerate = !parsed.data.caption.trim();

    const result = await createCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a social media copywriter specializing in short-form video content (Instagram Reels, TikTok, YouTube Shorts, Facebook Reels). ${
            isGenerate
              ? 'Generate an engaging caption for a video post.'
              : 'Improve the given caption to maximize engagement.'
          }

Rules:
- Strong hook in the first line
- Include a clear CTA inspired by the saved CTAs below (if available)
- Use line breaks for readability
- Keep it under 2200 characters
- Match the brand voice and align with the brand guide
- End the caption with relevant hashtags from the saved hashtag sets below (if available)
- Return ONLY the caption text with hashtags, no explanation
- Do NOT use markdown formatting (no asterisks, no headers, no horizontal rules, no backticks)

${clientContext ? `Client context:${clientContext}` : ''}${savedCaptionsContext}`,
        },
        {
          role: 'user',
          content: isGenerate
            ? 'Generate an engaging social media caption for this brand\'s next video post.'
            : `Improve this caption:\n\n${parsed.data.caption}`,
        },
      ],
      maxTokens: 500,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    return NextResponse.json({ improved_caption: result.text.trim() });
  } catch (error) {
    console.error('POST /api/scheduler/ai/improve-caption error:', error);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
