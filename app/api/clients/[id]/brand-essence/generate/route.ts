import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

export const maxDuration = 60;

// NAT-57 follow-up: generate the "essence trio" (tagline, value prop,
// mission statement) from whatever brand data we already have for the
// client. Runs as an explicit admin action — not auto-regenerated on
// any write — because the LLM output is inspirational, not
// authoritative. Admin reviews before saving.
//
// Data sources fed to the LLM (in priority order):
//   1. clients.description + industry + brand_voice + target_audience
//   2. clients.services + products
//   3. The client's latest brand_dna_status='ready' brand guideline
//      (client_knowledge_entries row). Richest source when present.
//
// Output contract: JSON object with three string fields. Admin picks
// which ones to keep / edit before hitting save in the UI.

const BodySchema = z.object({
  // Description joined the list 2026-05-14 so the brand-profile page can
  // auto-populate it when empty. Same prompt machinery, different field.
  fields: z
    .array(z.enum(['description', 'tagline', 'value_proposition', 'mission_statement']))
    .nonempty()
    .default(['tagline', 'value_proposition', 'mission_statement']),
});

/** Admin or scoped viewer with access to the client. */
async function authorizeForClient(clientId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const ctx = await getEffectiveAccessContext(user, adminClient);
  if (ctx.clientIds !== null && !ctx.clientIds.includes(clientId)) return null;
  return user;
}

/**
 * POST /api/clients/[id]/brand-essence/generate
 *
 * Generate tagline / value proposition / mission statement from
 * existing brand data. Does NOT save — returns suggestions. Admin
 * picks what to keep and PATCHes via /api/clients/[id]/brand-profile.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await authorizeForClient(clientId);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { fields } = parsed.data;

    const adminClient = createAdminClient();

    // Pull the source data in parallel.
    const [clientResult, guidelineResult] = await Promise.all([
      adminClient
        .from('clients')
        .select(
          'name, description, industry, brand_voice, target_audience, services, products, website_url, brand_dna_status',
        )
        .eq('id', clientId)
        .maybeSingle(),
      adminClient
        .from('client_knowledge_entries')
        .select('content')
        .eq('client_id', clientId)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const client = clientResult.data;
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Truncate the brand guideline aggressively — it can be tens of KB
    // and we only need the opening descriptive chunk for essence-level
    // inspiration, not the full style guide. Cheaper + faster LLM call.
    const guidelineSnippet = (guidelineResult.data?.content ?? '').slice(0, 4000);

    const ctxBlocks: string[] = [];
    if (client.description) ctxBlocks.push(`DESCRIPTION:\n${client.description}`);
    if (client.industry) ctxBlocks.push(`INDUSTRY: ${client.industry}`);
    if (client.brand_voice) ctxBlocks.push(`BRAND VOICE: ${client.brand_voice}`);
    if (client.target_audience) ctxBlocks.push(`TARGET AUDIENCE: ${client.target_audience}`);
    if (Array.isArray(client.services) && client.services.length > 0) {
      ctxBlocks.push(`SERVICES: ${(client.services as string[]).join(', ')}`);
    }
    if (Array.isArray(client.products) && client.products.length > 0) {
      ctxBlocks.push(`PRODUCTS: ${(client.products as string[]).join(', ')}`);
    }
    if (client.website_url) ctxBlocks.push(`WEBSITE: ${client.website_url}`);
    if (guidelineSnippet) ctxBlocks.push(`BRAND GUIDELINE EXCERPT:\n${guidelineSnippet}`);

    if (ctxBlocks.length === 0) {
      return NextResponse.json(
        {
          error:
            'Not enough brand data to generate essence. Add a description, industry, or run the brand-DNA pipeline first.',
        },
        { status: 422 },
      );
    }

    // One LLM call for all three fields — cheaper than three separate
    // calls and produces more coherent output (the fields naturally
    // reinforce each other when written together).
    const fieldDescriptions: Record<string, string> = {
      description:
        '- "description": 2-4 sentences. A neutral, factual intro to the brand. What it does, who it serves, what category it sits in. Plain language, no marketing fluff.',
      tagline: '- "tagline": 3-8 words. Punchy, memorable. Think Nike\'s "Just Do It".',
      value_proposition:
        '- "value_proposition": 1-2 sentences. The specific outcome the brand delivers for its target audience. Concrete, not aspirational.',
      mission_statement:
        '- "mission_statement": 1-3 sentences. Why the brand exists in the world. Long-term intent, not tactical.',
    };
    const requestedFieldLines = fields.map((f) => fieldDescriptions[f]).join('\n');

    const prompt = `You are a brand strategist writing a fresh brand essence for a new client.
Using ONLY the data below, write the requested fields for this brand. Stay grounded in the facts; do not invent features, claims, or audiences not supported by the source.

Brand: ${client.name ?? 'Unnamed brand'}

${ctxBlocks.join('\n\n')}

Write:
${requestedFieldLines}

Return ONLY valid JSON — no prose around it — with exactly the requested keys. Example shape:
{
  ${fields.map((f) => `"${f}": "…"`).join(',\n  ')}
}`;

    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      feature: 'brand_essence_generate',
      jsonMode: true,
      userId: user.id,
    });

    type Suggestion = {
      description?: string;
      tagline?: string;
      value_proposition?: string;
      mission_statement?: string;
    };

    let suggestions: Suggestion;
    try {
      suggestions = parseAIResponseJSON<Suggestion>(result.text);
    } catch {
      return NextResponse.json(
        { error: 'AI returned an unparseable response — try again' },
        { status: 500 },
      );
    }

    // Return only the requested fields; drop any the LLM hallucinated
    // extras for.
    const out: Suggestion = {};
    for (const f of fields) {
      const v = suggestions[f];
      if (typeof v === 'string' && v.trim().length > 0) out[f] = v.trim();
    }

    return NextResponse.json({ suggestions: out });
  } catch (err) {
    console.error('brand-essence/generate fatal', err);
    // Surface the real failure (OpenRouter credits, budget, missing key,
    // timeout) instead of "Internal server error" — the inline editor
    // toasts whatever string we return here.
    const message =
      err instanceof Error && err.message ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
