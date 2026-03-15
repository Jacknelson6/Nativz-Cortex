import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const rescriptSchema = z.object({
  client_id: z.string().uuid().optional(),
  brand_voice: z.string().optional(),
  product: z.string().optional(),
  target_audience: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/moodboard/items/[id]/rescript
 *
 * AI-rescript a moodboard video for a specific brand. Uses the item's hook, transcript,
 * and winning elements as a structural template, then rewrites the spoken word script
 * for the target brand. Saves the rescript and replication_brief to the item.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID
 * @body client_id - Client UUID for brand voice context (optional)
 * @body brand_voice - Brand voice override (optional)
 * @body product - Product or service being promoted (optional)
 * @body target_audience - Target audience description (optional)
 * @body notes - Additional adaptation notes (optional)
 * @returns {{ rescript: { script, client_id, brand_voice, product, target_audience, generated_at } }}
 */
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
    const userNotes = parsed.data.notes || '';

    const prompt = `You are a senior video content strategist specializing in adapting viral content for brands.

Original video analysis:
- Title: ${item.title || 'Unknown'}
- Concept: ${item.concept_summary || 'Not analyzed'}
- Hook: ${item.hook || 'Not identified'}
- Hook Score: ${item.hook_score || 'N/A'}/10
- Hook Type: ${item.hook_type || 'N/A'}
- CTA: ${item.cta || 'Not identified'}
- Transcript: ${item.transcript ? item.transcript.substring(0, 3000) : 'Not available'}
- Winning elements: ${(item.winning_elements ?? []).join(', ') || 'Not analyzed'}
- Content themes: ${(item.content_themes ?? []).join(', ') || 'Not analyzed'}
- Duration: ${item.duration ? `${item.duration}s` : 'Unknown'}

${clientInfo ? `${clientInfo}\n` : ''}${brandVoice ? `Brand Voice: ${brandVoice}\n` : ''}${product ? `Product/Service: ${product}\n` : ''}${targetAudience ? `Target Audience: ${targetAudience}\n` : ''}${userNotes ? `Additional notes: ${userNotes}\n` : ''}

Rescript this video for the specified brand. Write ONLY the spoken word script — the exact words the person on camera should say. Keep the same structural formula, hook style, and pacing that made the original work, but adapt the content entirely for the brand.

Do NOT include shot descriptions, camera directions, stage directions, hashtags, or posting strategy. Just the spoken words, line by line.

Return a JSON object with exactly this structure (no markdown, just raw JSON):
{
  "script": "The full spoken word script. Each line or beat on a new line. Just the words to say, nothing else."
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
        max_tokens: 2000,
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
    let script: string;
    try {
      const jsonStr = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
      const parsed2 = JSON.parse(jsonStr);
      script = parsed2.script || parsed2.adapted_script || content;
    } catch {
      // If JSON parse fails, use the raw text as the script
      script = content;
    }

    const rescriptData = {
      script,
      client_id: parsed.data.client_id || undefined,
      brand_voice: brandVoice || undefined,
      product: product || undefined,
      target_audience: targetAudience || undefined,
      generated_at: new Date().toISOString(),
    };

    // Save to DB
    await adminClient
      .from('moodboard_items')
      .update({
        rescript: rescriptData,
        replication_brief: script,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ rescript: rescriptData });
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/rescript error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
