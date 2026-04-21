import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { getBrandContext } from '@/lib/knowledge/brand-context';

// Keep this endpoint on the 5-minute ceiling since a 30-concept generation
// against a verbose model can take a while. Vercel Fluid Compute bills
// active CPU, so idle time on the API round-trip is nearly free.
export const maxDuration = 300;

const MIN_COUNT = 1;
const MAX_COUNT = 50;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  prompt: z.string().min(3).max(4000),
  count: z.coerce.number().int().min(MIN_COUNT).max(MAX_COUNT).default(20),
});

interface RawConcept {
  template_name?: unknown;
  headline?: unknown;
  body_copy?: unknown;
  visual_description?: unknown;
  source_grounding?: unknown;
  image_prompt?: unknown;
}

/**
 * Generate N ad concepts grounded in the client's brand DNA + asset library
 * + extracted templates. Output is text-first (headline, body, visual
 * description, source grounding, image prompt); per-card image generation
 * is a follow-up action so admins can cheaply triage 30+ concepts before
 * spending image-gen budget.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, prompt, count } = parsed.data;

  // Brand + asset + template context — run in parallel. Each feeds a
  // different section of the system prompt.
  const [brandContext, assetsResult, templatesResult] = await Promise.all([
    getBrandContext(clientId),
    admin
      .from('ad_assets')
      .select('id, kind, label, notes, tags')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('ad_prompt_templates')
      .select('id, name, ad_category, tags, prompt_schema')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const assets = assetsResult.data ?? [];
  const templates = templatesResult.data ?? [];

  // Create the batch row first so inserted concepts have a parent. Status
  // starts at 'generating' and flips to 'completed' / 'failed' at the end.
  const { data: batchRow, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: clientId,
      status: 'generating',
      total_count: count,
      completed_count: 0,
      failed_count: 0,
      config: {
        user_prompt: prompt,
        asset_ids: assets.map((a) => a.id),
        template_ids: templates.map((t) => t.id),
      },
      brand_context_source: 'brand_dna',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (batchErr || !batchRow) {
    return NextResponse.json(
      { error: `Failed to create batch: ${batchErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // Reserve slug range atomically so concurrent batches can't collide.
  const { data: slugStart, error: slugErr } = await admin.rpc('reserve_ad_concept_slugs', {
    p_client_id: clientId,
    p_count: count,
  });

  if (slugErr || typeof slugStart !== 'number') {
    await markBatchFailed(admin, batchRow.id);
    return NextResponse.json(
      { error: `Slug reservation failed: ${slugErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const systemPrompt = buildSystemPrompt({
    count,
    brandBlock: brandContext.toPromptBlock(),
    assets,
    templates,
  });

  let raw: string;
  try {
    const completion = await createOpenRouterRichCompletion({
      feature: 'ad_concepts_generation',
      userId: user.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      maxTokens: 8000,
    });
    raw = completion.text ?? '';
  } catch (err) {
    await markBatchFailed(admin, batchRow.id);
    const message = err instanceof Error ? err.message : 'Model call failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const rawConcepts = parseConcepts(raw);
  if (rawConcepts.length === 0) {
    await markBatchFailed(admin, batchRow.id);
    return NextResponse.json(
      { error: 'Model returned no parseable concepts' },
      { status: 502 },
    );
  }

  // Pad / truncate to the requested count — if the model returned fewer,
  // we insert what we have and mark the batch 'partial'. If it returned
  // more (rare, but LLMs do what they do), we take the first `count`.
  const trimmed = rawConcepts.slice(0, count);
  const rows = trimmed.map((c, idx) => ({
    client_id: clientId,
    batch_id: batchRow.id,
    slug: `concept-${String(slugStart + idx).padStart(3, '0')}`,
    template_name: strOr(c.template_name, 'Untitled template'),
    headline: strOr(c.headline, 'Untitled concept'),
    body_copy: strOrNull(c.body_copy),
    visual_description: strOrNull(c.visual_description),
    source_grounding: strOr(c.source_grounding, 'No grounding provided'),
    image_prompt: strOr(c.image_prompt, ''),
    status: 'pending',
    position: idx,
  }));

  const { data: inserted, error: insertErr } = await admin
    .from('ad_concepts')
    .insert(rows)
    .select(
      'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
    );

  if (insertErr || !inserted) {
    await markBatchFailed(admin, batchRow.id);
    return NextResponse.json(
      { error: `Concept insert failed: ${insertErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const partial = inserted.length < count;
  await admin
    .from('ad_generation_batches')
    .update({
      status: partial ? 'partial' : 'completed',
      completed_count: inserted.length,
      failed_count: partial ? count - inserted.length : 0,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchRow.id);

  return NextResponse.json({
    batchId: batchRow.id,
    status: partial ? 'partial' : 'completed',
    concepts: inserted,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markBatchFailed(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<void> {
  await admin
    .from('ad_generation_batches')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
}

function parseConcepts(raw: string): RawConcept[] {
  if (!raw || typeof raw !== 'string') return [];

  // The response_format=json_object gives us an object, so expect
  // { concepts: [...] }. Strip fences defensively in case the model ignores
  // the format hint.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) return parsed as RawConcept[];
  if (parsed && typeof parsed === 'object' && 'concepts' in parsed) {
    const c = (parsed as { concepts?: unknown }).concepts;
    if (Array.isArray(c)) return c as RawConcept[];
  }
  return [];
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// System prompt — morning-ads skill, ported and compacted
// ---------------------------------------------------------------------------

interface PromptInputs {
  count: number;
  brandBlock: string;
  assets: Array<{ id: string; kind: string; label: string; notes: string | null; tags: string[] | null }>;
  templates: Array<{ id: string; name: string; ad_category: string | null; tags: string[] | null; prompt_schema: Record<string, unknown> }>;
}

function buildSystemPrompt({ count, brandBlock, assets, templates }: PromptInputs): string {
  const assetManifest =
    assets.length === 0
      ? '(none yet — uploads live in the Assets tab)'
      : assets
          .map((a) => {
            const tagBlock = a.tags && a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
            const noteBlock = a.notes ? ` — ${a.notes}` : '';
            return `- (${a.kind}) "${a.label}"${tagBlock}${noteBlock}`;
          })
          .join('\n');

  const templateManifest =
    templates.length === 0
      ? '(none yet — extracted templates live in the Templates tab)'
      : templates
          .map((t) => {
            const schema = JSON.stringify(t.prompt_schema).slice(0, 600);
            return `- "${t.name}" (${t.ad_category ?? 'uncategorized'}): ${schema}`;
          })
          .join('\n');

  return `You are an expert direct-response ad copywriter working inside Nativz Cortex. Your job is to generate ${count} fresh static ad concepts grounded in real brand data and real customer language.

# Brand DNA

${brandBlock}

# Asset library (available references — cite by label)

${assetManifest}

# Extracted ad templates (reference patterns from the client's own library)

${templateManifest}

# Built-in template library (morning-ads 15 patterns)

Cycle through these patterns across your ${count} concepts so the user gets variety — do not produce all ${count} concepts in a single template.

1. Headline Statement — bold one-line claim, product hero, minimal background.
2. Us vs. Them — side-by-side comparison, competitor muted, product full-color.
3. Stat Callout — dominant number (60% of visual), supporting context below.
4. Review Card — five-star testimonial styled as a screenshotted review.
5. Testimonial Stack — three customer quotes vertically, photo + name + one-line quote each.
6. Before / After — split image with arrow between, transformation framing.
7. Problem / Solution — pain at top, product as answer at bottom.
8. Founder Message — handwritten-style note from the founder, conversational.
9. Ingredient Spotlight — product hero center, 4-6 callout boxes around edges.
10. Press Mention — "As seen in" header with publication logos, quote below.
11. Lifestyle Hero — product in use in real environment, minimal copy.
12. Numbered List — "5 reasons [audience] are switching" with numbered items.
13. FAQ Card — common objection as question, direct answer below.
14. Competitor Callout — name a specific competitor, bold but factual differentiator.
15. Origin Story — founder photo + why-we-built-this narrative, 4-6 lines.

# Rules

- **Ground every concept.** source_grounding is mandatory. Cite a specific asset label from the Asset library, a quote from brand DNA, or a verbatim phrase from brand voice — whichever the concept leans on. If nothing grounds it, switch templates.
- **Pull copy verbatim where possible.** When referencing a customer quote or review, quote directly.
- **Match the brand voice.** Tone, sentence structure, vocabulary should follow the verbal identity.
- **Cycle templates.** Cover as much of the 15-template library + the client's extracted templates as you can within ${count} concepts.
- **Visual descriptions must be specific.** Describe lighting, angle, background, color palette, props, composition — not just "clean product shot".
- **image_prompt must be a structured Gemini prompt.** Format: lighting + camera + subject + composition + style + brand colors + negative prompts.
- **Never invent claims.** If the brand hasn't said it and the asset library doesn't support it, don't put it in the ad.

# Output format

Return a JSON object with shape:

{
  "concepts": [
    {
      "template_name": "Headline Statement | Us vs. Them | Stat Callout | Review Card | ...",
      "headline": "The main on-screen claim (keep tight — 3-8 words for Headline Statement, longer for Numbered List / Origin Story).",
      "body_copy": "Optional supporting text that appears on the ad. Null if the template is headline-only.",
      "visual_description": "Plain-English description of what the ad image should look like. Specific about composition, lighting, colors, props.",
      "source_grounding": "Which asset label, brand-DNA claim, or customer quote this concept is based on. Required.",
      "image_prompt": "Structured Gemini prompt. Format: lighting + camera + subject + composition + style + brand colors + negative prompts. Concrete enough that a text-to-image model can render it."
    },
    ...${count} total
  ]
}

No markdown, no commentary, no code fences — just the JSON object.`;
}
