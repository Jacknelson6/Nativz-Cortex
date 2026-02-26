import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';

const replicateSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  format: z.string().min(1),
  notes: z.string().optional(),
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
    const parsed = replicateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the item
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
        clientInfo = `Client: ${client.name}
Industry: ${client.industry}
Target audience: ${client.target_audience || 'Not specified'}
Brand voice: ${client.brand_voice || 'Not specified'}`;
      }
    }

    // Determine original platform
    let platform = 'unknown';
    if (item.url?.includes('youtube.com') || item.url?.includes('youtu.be')) platform = 'YouTube';
    else if (item.url?.includes('tiktok.com')) platform = 'TikTok';
    else if (item.url?.includes('instagram.com')) platform = 'Instagram';

    const prompt = `You are a senior video content strategist at a marketing agency.

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
- Platform: ${platform}

${clientInfo || 'No specific client — generate a generic brief.'}
Target format: ${parsed.data.format}
${parsed.data.notes ? `Adaptation notes: ${parsed.data.notes}` : ''}

Generate a complete video replication brief with these clearly labeled sections:

## Concept Adaptation
How this concept is adapted for the client's brand and audience (2-3 sentences)

## Suggested Hook
Rewritten hook optimized for the client — include why this hook style works

## Script Outline
Scene-by-scene script outline with timestamps, dialogue/VO, and on-screen action

## Shot List
Numbered list of every shot needed:
| # | Description | Duration | Camera Angle | Notes |

## Music Direction
Suggested sound/music style, mood, and any specific recommendations

## Caption Suggestions
On-screen text overlays with timing and style notes

## Pacing Notes
Editing rhythm guidance (cuts per minute, transitions, energy curve)

## CTA
Adapted call-to-action

## Production Notes
Specific notes for the videographer or editor

Write the brief in clear, actionable language that a videographer can follow on set.`;

    const aiResponse = await createCompletion({
      messages: [
        { role: 'system', content: 'You are a senior video content strategist. Write clear, actionable replication briefs.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 3000,
    });

    const brief = aiResponse.text;

    // Save to item
    await adminClient
      .from('moodboard_items')
      .update({
        replication_brief: brief,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ brief });
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/replicate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
