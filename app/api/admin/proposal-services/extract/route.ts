import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';

const Body = z.object({
  agency: z.enum(['anderson', 'nativz']),
  source: z.string().min(20).max(50000),
});

/**
 * POST /api/admin/proposal-services/extract
 *
 * Paste an existing proposal (markdown / plain text — copy from a doc,
 * a PDF text extract, whatever) and the LLM returns a structured array
 * of services + suggested pricing rules. The admin reviews and accepts
 * the parsed output via the catalog UI; nothing writes to the catalog
 * directly from this endpoint.
 *
 * Output shape matches what the catalog form expects, so the UI can
 * pre-fill the Create form with each suggestion.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }
  const { agency, source } = parsed.data;

  const SYSTEM = `You are a proposal-parsing assistant. Extract every distinct service/line item from the pasted proposal text and emit them as a JSON array conforming exactly to this TypeScript shape:

{
  "services": Array<{
    "slug": string,                 // lowercase-hyphenated (e.g. "short-form-video")
    "name": string,                 // human label
    "category": "social"|"paid_media"|"web"|"creative"|"strategy"|"other",
    "description": string|null,     // one-line summary
    "scope_md": string|null,        // 1–4 sentences of scope detail in markdown
    "included_items": string[],     // bullet points; up to 8
    "billing_unit": "per_video"|"per_post"|"per_month"|"per_year"|"per_quarter"|"flat"|"per_hour"|"per_unit",
    "base_unit_price_cents": number,// per-unit price in cents (e.g. 15000 for $150)
    "default_quantity": number      // 1 unless source explicitly says otherwise
  }>,
  "rules": Array<{
    "service_slug": string|null,    // null = whole-proposal rule
    "label": string,                // human-readable (e.g. "10% off when ordering 12+")
    "trigger_kind": "min_quantity"|"min_total_cents"|"cadence"|"manual",
    "trigger_value": object,        // {"quantity": 12} | {"cents": 100000} | {"cadence": "annual"} | {}
    "discount_kind": "pct"|"flat_cents"|"unit_price_override",
    "discount_value": object        // {"pct":10} | {"cents":50000} | {"new_unit_cents":12500}
  }>
}

Rules:
- Output ONLY valid JSON, no prose, no code fences.
- If the source mentions a tier with multiple included items, treat each item as a separate service ONLY when it has its own line price. Otherwise pick the predominant billing unit and bake the items into included_items.
- Convert all dollar amounts to cents.
- Make slugs unique within the response.
- If unsure about category, use "other".
- Skip the agreement/payment terms section — only extract priced services.`;

  const { text } = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Agency: ${agency}\n\nProposal text:\n\n${source}`,
      },
    ],
    maxTokens: 4000,
    feature: 'proposal_service_extract',
    userId: user.id,
    jsonMode: true,
  });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'LLM returned non-JSON response', raw: text.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, parsed: json });
}
