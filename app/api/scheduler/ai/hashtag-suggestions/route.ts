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
 * POST /api/scheduler/ai/hashtag-suggestions
 *
 * Generate 15-20 hashtag suggestions for a post caption using AI, grouped into
 * high_volume, niche, and branded categories. Optionally uses client context
 * (industry + keywords) to tailor suggestions.
 *
 * @auth Required (any authenticated user)
 * @body caption - Post caption to base suggestions on (optional)
 * @body client_id - Client UUID for industry/keyword context (optional)
 * @returns {{ hashtags: string[], groups: { high_volume, niche, branded } }}
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

    let clientContext = '';
    if (parsed.data.client_id) {
      const adminClient = createAdminClient();
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, topic_keywords')
        .eq('id', parsed.data.client_id)
        .single();

      if (client) {
        clientContext = `Industry: ${client.industry ?? 'General'}\nKeywords: ${(client.topic_keywords ?? []).join(', ')}`;
      }
    }

    const result = await createCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a social media hashtag strategist. Suggest 15-20 relevant hashtags for a video post.

Return a JSON object with this exact structure:
{
  "high_volume": ["hashtag1", "hashtag2", ...],
  "niche": ["hashtag1", "hashtag2", ...],
  "branded": ["hashtag1", "hashtag2", ...]
}

Rules:
- Do NOT include the # symbol
- high_volume: popular hashtags with broad reach (5-8)
- niche: targeted hashtags for the specific topic (5-8)
- branded: brand-specific or campaign hashtags (3-5)
- Return ONLY valid JSON, no explanation

${clientContext}`,
        },
        {
          role: 'user',
          content: `Suggest hashtags for this caption:\n\n${parsed.data.caption || 'General video post for this brand'}`,
        },
      ],
      maxTokens: 400,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    // Parse the AI response
    try {
      const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const hashtags = [
        ...(parsed.high_volume ?? []),
        ...(parsed.niche ?? []),
        ...(parsed.branded ?? []),
      ].map((h: string) => h.replace(/^#/, ''));

      return NextResponse.json({ hashtags, groups: parsed });
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }
  } catch (error) {
    console.error('POST /api/scheduler/ai/hashtag-suggestions error:', error);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
