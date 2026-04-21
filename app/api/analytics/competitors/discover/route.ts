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

    // Get existing competitors to avoid duplicates. We dedupe on brand
    // name here (domain isn't in the schema) — good enough since the LLM
    // keys its suggestions on brand name too.
    const { data: existing } = await adminClient
      .from('client_competitors')
      .select('display_name, username')
      .eq('client_id', parsed.data.client_id);

    const existingNames = new Set(
      (existing ?? [])
        .flatMap((e) => [e.display_name, e.username])
        .filter((v): v is string => !!v)
        .map((v) => v.toLowerCase()),
    );

    // Get client's social profiles for additional context
    const { data: profiles } = await adminClient
      .from('social_profiles')
      .select('platform, username, display_name')
      .eq('client_id', parsed.data.client_id);

    // Ask the LLM for REAL-WORLD facts (brand name + website domain), not
    // platform handles. LLMs hallucinate TikTok/IG usernames but are much
    // more reliable on named brands and their homepages. We bridge from
    // domain → socials deterministically via /resolve (website footer scrape).
    const prompt = `You are a competitive analyst. Identify 5-8 direct competitor BRANDS for this business.

BRAND:
- Name: ${client.name}
- Industry: ${client.industry ?? 'unknown'}
- Niche: ${client.niche ?? 'unknown'}
- Brand voice: ${client.brand_voice ?? 'unknown'}
${(profiles ?? []).length > 0 ? `- Social accounts: ${(profiles ?? []).map(p => `@${p.username} (${p.platform})`).join(', ')}` : ''}

ALREADY TRACKING (exclude any brand whose name or domain matches these):
${existingNames.size > 0 ? Array.from(existingNames).map((n) => `- ${n}`).join('\n') : '- None yet'}

Return a JSON array of competitor BRANDS — real companies you are confident exist.
For each, include:
- "brand_name": the company's real name (e.g. "Liquid Death")
- "domain": the bare website domain, no protocol, no path (e.g. "liquiddeath.com")
- "reason": one short sentence on why they compete

Rules:
- Only include brands whose website you are confident of. Skip rather than guess.
- NEVER invent social handles — we will look those up ourselves.
- Prefer directly-competing brands in the same niche over aspirational/adjacent ones.

Return ONLY valid JSON:
[
  { "brand_name": "Example Co", "domain": "example.com", "reason": "Same niche, same audience" }
]`;

    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
      feature: 'benchmarking_discover',
      jsonMode: true,
    });

    type Suggestion = { brand_name: string; domain: string; reason: string };
    let suggestions: Suggestion[];
    try {
      suggestions = parseAIResponseJSON<Suggestion[]>(result.text);
      if (!Array.isArray(suggestions)) {
        return NextResponse.json({ error: 'AI could not identify competitors' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ error: 'AI could not identify competitors' }, { status: 500 });
    }

    // Normalize the domain (strip protocol/www/trailing slash) and drop
    // anything that doesn't look like a real domain — so the downstream
    // /resolve call doesn't choke on "unknown" or half-formed URLs.
    const filtered = suggestions
      .map((s) => ({
        brand_name: (s.brand_name ?? '').trim(),
        domain: (s.domain ?? '')
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/.*$/, ''),
        reason: (s.reason ?? '').trim(),
      }))
      .filter((s) => s.brand_name && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s.domain))
      .filter(
        (s) =>
          !existingNames.has(s.brand_name.toLowerCase()) &&
          !existingNames.has(s.domain),
      );

    return NextResponse.json({ suggestions: filtered });
  } catch (error) {
    console.error('POST /api/analytics/competitors/discover error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
