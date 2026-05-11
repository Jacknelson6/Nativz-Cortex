import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

export const maxDuration = 60;

/**
 * POST /api/clients/[id]/captions/generate
 *
 * Drafts the verbatim caption boilerplate the strategist appends to
 * every AI-written caption for this brand:
 *   - cta: 1-2 short sentence call-to-action with the brand's primary URL
 *   - hashtags: 8-12 lowercase tokens (no leading '#'); includes brand name +
 *     2-4 regional/niche tags + the rest topical evergreen for the brand.
 *
 * Source data: clients.name + description + industry + website + caption_notes
 * + hashtag_notes + cta_notes + the latest brand_guideline metadata if any.
 * Returns suggestions — does NOT save. The card PATCHes /brand-profile.
 *
 * @auth Admin only.
 */

const BodySchema = z.object({
  fields: z
    .array(z.enum(['caption_cta', 'caption_hashtags']))
    .nonempty()
    .default(['caption_cta', 'caption_hashtags']),
});

const ADMIN_ROLES = ['admin', 'super_admin'];

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || !ADMIN_ROLES.includes(userData.role)) return null;
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { fields } = parsed.data;

    const adminClient = createAdminClient();

    const [clientResult, guidelineResult] = await Promise.all([
      adminClient
        .from('clients')
        .select(
          'name, description, industry, brand_voice, target_audience, services, products, website_url, caption_notes, hashtag_notes, cta_notes, primary_country, primary_state, primary_city',
        )
        .eq('id', clientId)
        .maybeSingle(),
      adminClient
        .from('client_knowledge_entries')
        .select('content, metadata')
        .eq('client_id', clientId)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const client = clientResult.data;
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Truncate aggressively — we only need the opening descriptive chunk
    // for caption-level inspiration, not the full guideline.
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
    const loc = [client.primary_city, client.primary_state, client.primary_country]
      .filter(Boolean)
      .join(', ');
    if (loc) ctxBlocks.push(`LOCATION: ${loc}`);
    if (client.caption_notes) ctxBlocks.push(`CAPTION NOTES (strategist guidance):\n${client.caption_notes}`);
    if (client.hashtag_notes) ctxBlocks.push(`HASHTAG NOTES (strategist guidance):\n${client.hashtag_notes}`);
    if (client.cta_notes) ctxBlocks.push(`CTA NOTES (strategist guidance):\n${client.cta_notes}`);
    if (guidelineSnippet) ctxBlocks.push(`BRAND GUIDELINE EXCERPT:\n${guidelineSnippet}`);

    if (ctxBlocks.length === 0) {
      return NextResponse.json(
        {
          error:
            'Not enough brand data to draft captions. Add a description, industry, or website first.',
        },
        { status: 422 },
      );
    }

    const fieldDescriptions: Record<string, string> = {
      caption_cta:
        '- "caption_cta": 1-2 short sentences. The verbatim CTA appended to every caption for this brand. Lead with the desired action and include the brand\'s primary URL if one was provided. Plain text only, no hashtags, no emojis.',
      caption_hashtags:
        '- "caption_hashtags": 8-12 lowercase tokens, NO leading \'#\'. Mix the brand name (slugified), 2-4 location/niche tags if location was provided, and 4-6 topical evergreen tags suited to the brand\'s industry and audience. Return as a JSON array of strings.',
    };
    const requestedFieldLines = fields.map((f) => fieldDescriptions[f]).join('\n');

    const prompt = `You are a social-media strategist writing the verbatim caption boilerplate (CTA and hashtag wall) that will be appended to EVERY AI-written caption for this brand on TikTok, Reels, and Shorts.

Using ONLY the data below, write the requested fields. Stay grounded in the facts; do not invent products, claims, or audiences not supported by the source.

Brand: ${client.name ?? 'Unnamed brand'}

${ctxBlocks.join('\n\n')}

Write:
${requestedFieldLines}

Return ONLY valid JSON — no prose around it — with exactly the requested keys. Example shape:
{
  ${fields
    .map((f) =>
      f === 'caption_hashtags'
        ? `"caption_hashtags": ["…", "…"]`
        : `"caption_cta": "…"`,
    )
    .join(',\n  ')}
}`;

    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 700,
      feature: 'caption_boilerplate_generate',
      jsonMode: true,
      userId: user.id,
    });

    type Suggestion = {
      caption_cta?: string;
      caption_hashtags?: string[];
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

    const out: Suggestion = {};
    if (fields.includes('caption_cta')) {
      const v = suggestions.caption_cta;
      if (typeof v === 'string' && v.trim().length > 0) out.caption_cta = v.trim();
    }
    if (fields.includes('caption_hashtags')) {
      const arr = suggestions.caption_hashtags;
      if (Array.isArray(arr)) {
        // Normalize: strip leading '#', lowercase, drop empties, dedupe, cap 50.
        const clean = Array.from(
          new Set(
            arr
              .map((t) => (typeof t === 'string' ? t : ''))
              .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
              .filter(Boolean),
          ),
        ).slice(0, 50);
        if (clean.length > 0) out.caption_hashtags = clean;
      }
    }

    return NextResponse.json({ suggestions: out });
  } catch (err) {
    console.error('captions/generate fatal', err);
    const message =
      err instanceof Error && err.message ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
