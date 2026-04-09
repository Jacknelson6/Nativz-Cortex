import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

export const maxDuration = 60;

const DiscoverSchema = z.object({
  client_id: z.string().uuid(),
  platform: z.enum(['tiktok', 'instagram']).default('tiktok'),
});

/**
 * POST /api/analytics/competitors/discover — AI-assisted competitor discovery
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = DiscoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get client info for context
    const { data: client } = await adminClient
      .from('clients')
      .select('name, industry, niche, brand_voice')
      .eq('id', parsed.data.client_id)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Get existing competitors to avoid duplicates
    const { data: existing } = await adminClient
      .from('client_competitors')
      .select('username')
      .eq('client_id', parsed.data.client_id);

    const existingUsernames = (existing ?? []).map(e => e.username.toLowerCase());

    // Get client's social profiles for additional context
    const { data: profiles } = await adminClient
      .from('social_profiles')
      .select('platform, username, display_name')
      .eq('client_id', parsed.data.client_id);

    const prompt = `You are a social media competitive analyst. Identify 5-8 TikTok competitors for this brand.

BRAND:
- Name: ${client.name}
- Industry: ${client.industry ?? 'unknown'}
- Niche: ${client.niche ?? 'unknown'}
- Brand voice: ${client.brand_voice ?? 'unknown'}
${(profiles ?? []).length > 0 ? `- Social accounts: ${(profiles ?? []).map(p => `@${p.username} (${p.platform})`).join(', ')}` : ''}

ALREADY TRACKING (exclude these):
${existingUsernames.length > 0 ? existingUsernames.map(u => `- @${u}`).join('\n') : '- None yet'}

Return a JSON array of competitor suggestions. Each should include a TikTok username (without @) and a brief reason why they're a competitor.

Return ONLY valid JSON:
[
  { "username": "competitor1", "reason": "Direct competitor in same niche" },
  { "username": "competitor2", "reason": "Similar content style and audience" }
]`;

    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
      feature: 'benchmarking_discover',
      jsonMode: true,
    });

    let suggestions: { username: string; reason: string }[];
    try {
      suggestions = parseAIResponseJSON<{ username: string; reason: string }[]>(result.text);
      if (!Array.isArray(suggestions)) {
        return NextResponse.json({ error: 'AI could not identify competitors' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ error: 'AI could not identify competitors' }, { status: 500 });
    }

    // Filter out already-tracked competitors
    const filtered = suggestions.filter(
      s => !existingUsernames.includes(s.username.toLowerCase())
    );

    return NextResponse.json({ suggestions: filtered });
  } catch (error) {
    console.error('POST /api/analytics/competitors/discover error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
