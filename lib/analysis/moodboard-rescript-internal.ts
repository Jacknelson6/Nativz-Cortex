import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';

export type RescriptResult =
  | { ok: true; script: string; rescript: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

export async function runMoodboardRescript(
  adminClient: SupabaseClient,
  itemId: string,
  user: { id: string; email?: string | null },
  options: {
    client_id?: string;
    brand_voice?: string;
    product?: string;
    target_audience?: string;
    notes?: string;
  },
): Promise<RescriptResult> {
  const { data: item, error: fetchError } = await adminClient.from('moodboard_items').select('*').eq('id', itemId).single();

  if (fetchError || !item) {
    return { ok: false, error: 'Item not found', status: 404 };
  }

  let clientInfo = '';
  if (options.client_id) {
    const { data: client } = await adminClient
      .from('clients')
      .select('name, industry, target_audience, brand_voice')
      .eq('id', options.client_id)
      .single();

    if (client) {
      clientInfo = `Client: ${client.name}\nIndustry: ${client.industry}\nTarget audience: ${client.target_audience || options.target_audience || 'Not specified'}\nBrand voice: ${client.brand_voice || options.brand_voice || 'Not specified'}`;
    }
  }

  const brandVoice = options.brand_voice || '';
  const product = options.product || '';
  const targetAudience = options.target_audience || '';
  const userNotes = options.notes || '';

  const prompt = `You are a senior video content strategist specializing in adapting viral content for brands.

Original video analysis:
- Title: ${item.title || 'Unknown'}
- Concept: ${item.concept_summary || 'Not analyzed'}
- Hook: ${item.hook || 'Not identified'}
- Hook Score: ${item.hook_score || 'N/A'}/10
- Hook Type: ${item.hook_type || 'N/A'}
- CTA: ${item.cta || 'Not identified'}
- Transcript: ${item.transcript ? (item.transcript as string).substring(0, 3000) : 'Not available'}
- Winning elements: ${((item.winning_elements as string[]) ?? []).join(', ') || 'Not analyzed'}
- Content themes: ${((item.content_themes as string[]) ?? []).join(', ') || 'Not analyzed'}
- Duration: ${item.duration ? `${item.duration}s` : 'Unknown'}

${clientInfo ? `${clientInfo}\n` : ''}${brandVoice ? `Brand Voice: ${brandVoice}\n` : ''}${product ? `Product/Service: ${product}\n` : ''}${targetAudience ? `Target Audience: ${targetAudience}\n` : ''}${userNotes ? `Additional notes: ${userNotes}\n` : ''}

Rescript this video for the specified brand. Write ONLY the spoken word script — the exact words the person on camera should say. Keep the same structural formula, hook style, and pacing that made the original work, but adapt the content entirely for the brand.

Do NOT include shot descriptions, camera directions, stage directions, hashtags, or posting strategy. Just the spoken words, line by line.

Return a JSON object with exactly this structure (no markdown, just raw JSON):
{
  "script": "The full spoken word script. Each line or beat on a new line. Just the words to say, nothing else."
}`;

  const aiResult = await createCompletion({
    messages: [
      {
        role: 'system',
        content: 'You are a senior video content strategist. Return only valid JSON, no markdown code fences.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 2000,
    feature: 'analysis_item_rescript',
    modelPreference: ['openrouter/hunter-alpha'],
    userId: user.id,
    userEmail: user.email ?? undefined,
  });
  const content = aiResult.text || '';

  if (!content) {
    return { ok: false, error: 'AI returned empty response', status: 502 };
  }

  let script: string;
  try {
    const jsonStr = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
    const parsed2 = JSON.parse(jsonStr) as { script?: string; adapted_script?: string };
    script = parsed2.script || parsed2.adapted_script || content;
  } catch {
    script = content;
  }

  const rescriptData = {
    script,
    client_id: options.client_id || undefined,
    brand_voice: brandVoice || undefined,
    product: product || undefined,
    target_audience: targetAudience || undefined,
    generated_at: new Date().toISOString(),
  };

  await adminClient
    .from('moodboard_items')
    .update({
      rescript: rescriptData,
      replication_brief: script,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  return { ok: true, script, rescript: rescriptData };
}
