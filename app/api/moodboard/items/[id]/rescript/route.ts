import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const rescriptSchema = z.object({
  client_id: z.string().uuid().optional(),
  brand_voice: z.string().optional(),
  product: z.string().optional(),
  target_audience: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = rescriptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Get client info if provided
    let clientInfo = '';
    if (parsed.data.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, target_audience, brand_voice')
        .eq('id', parsed.data.client_id)
        .single();

      if (client) {
        clientInfo = `Client: ${client.name}\nIndustry: ${client.industry}\nTarget audience: ${client.target_audience || parsed.data.target_audience || 'Not specified'}\nBrand voice: ${client.brand_voice || parsed.data.brand_voice || 'Not specified'}`;
      }
    }

    const brandVoice = parsed.data.brand_voice || '';
    const product = parsed.data.product || '';
    const targetAudience = parsed.data.target_audience || '';

    const prompt = `You are a senior video content strategist specializing in adapting viral content for brands.

Original video analysis:
- Title: ${item.title || 'Unknown'}
- Concept: ${item.concept_summary || 'Not analyzed'}
- Hook: ${item.hook || 'Not identified'}
- Hook Score: ${item.hook_score || 'N/A'}/10
- Hook Type: ${item.hook_type || 'N/A'}
- CTA: ${item.cta || 'Not identified'}
- Transcript: ${item.transcript ? item.transcript.substring(0, 3000) : 'Not available'}
- Pacing: ${item.pacing_detail ? JSON.stringify(item.pacing_detail) : item.pacing ? JSON.stringify(item.pacing) : 'Not analyzed'}
- Winning elements: ${(item.winning_elements ?? []).join(', ') || 'Not analyzed'}
- Content themes: ${(item.content_themes ?? []).join(', ') || 'Not analyzed'}
- Duration: ${item.duration ? `${item.duration}s` : 'Unknown'}

${clientInfo ? `${clientInfo}\n` : ''}${brandVoice ? `Brand Voice: ${brandVoice}\n` : ''}${product ? `Product/Service: ${product}\n` : ''}${targetAudience ? `Target Audience: ${targetAudience}\n` : ''}

Rescript this video for the specified brand. Keep the same structural formula and hook style that made the original work, but adapt the content entirely.

Return a JSON object with exactly this structure (no markdown, just raw JSON):
{
  "adapted_script": "The full adapted script with stage directions in brackets. Keep the same pacing and structure.",
  "shot_list": [
    { "number": 1, "description": "Shot description", "timing": "0:00-0:03", "notes": "Camera/edit notes" }
  ],
  "hook_alternatives": ["Hook option 1", "Hook option 2", "Hook option 3"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "posting_strategy": "When to post, platform-specific tips, engagement strategy"
}`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Nativz Cortex',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: 'You are a senior video content strategist. Return only valid JSON, no markdown code fences.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      console.error('OpenRouter API error:', aiResponse.status, errorBody.substring(0, 500));
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    if (!content) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
    }

    // Parse JSON from response (handle possible markdown fences)
    let rescriptData;
    try {
      const jsonStr = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
      rescriptData = JSON.parse(jsonStr);
    } catch {
      // If JSON parse fails, wrap the raw text
      rescriptData = {
        adapted_script: content,
        shot_list: [],
        hook_alternatives: [],
        hashtags: [],
        posting_strategy: '',
      };
    }

    // Add metadata
    rescriptData.brand_voice = brandVoice || undefined;
    rescriptData.product = product || undefined;
    rescriptData.target_audience = targetAudience || undefined;
    rescriptData.client_id = parsed.data.client_id || undefined;
    rescriptData.generated_at = new Date().toISOString();

    // Save to DB
    await adminClient
      .from('moodboard_items')
      .update({
        rescript: rescriptData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ rescript: rescriptData });
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/rescript error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
