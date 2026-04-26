import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { resolveOpenAiApiKeyForFeature } from '@/lib/ai/provider-keys';
import { trackUsage } from '@/lib/ai/usage';
import {
  formatReferenceAdsForPrompt,
  selectReferenceAdsForBrand,
  type ReferenceAd,
} from '@/lib/ad-creatives/reference-ad-library';
import {
  generateOpenAiAdImage,
  OpenAiImageError,
  estimateImageCostUsd,
} from '@/lib/ad-creatives/openai-image';

const CONCEPT_MODEL = process.env.AD_CONCEPT_MODEL?.trim() || 'openai/gpt-5.4-mini';
const DEFAULT_COUNT = 20;

interface RawConcept {
  reference_ad_id?: unknown;
  template_name?: unknown;
  headline?: unknown;
  body_copy?: unknown;
  visual_description?: unknown;
  source_grounding?: unknown;
  image_prompt?: unknown;
}

export interface GenerateReferenceDrivenBatchOptions {
  clientId: string;
  prompt: string;
  count?: number;
  userId?: string | null;
  userEmail?: string | null;
  renderImages?: boolean;
  pipeline?: 'chatgpt_image_monthly_gift' | 'chatgpt_image_chat';
}

export interface GeneratedConceptRow {
  id: string;
  slug: string;
  template_name: string;
  template_id: string | null;
  headline: string;
  body_copy: string | null;
  visual_description: string | null;
  source_grounding: string;
  image_prompt: string;
  image_storage_path: string | null;
  status: string;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateReferenceDrivenBatchResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed';
  concepts: GeneratedConceptRow[];
  referenceAds: ReferenceAd[];
}

export async function generateReferenceDrivenAdBatch(
  options: GenerateReferenceDrivenBatchOptions,
): Promise<GenerateReferenceDrivenBatchResult> {
  const admin = createAdminClient();
  const count = Math.min(Math.max(options.count ?? DEFAULT_COUNT, 1), 50);
  const pipeline = options.pipeline ?? 'chatgpt_image_chat';
  const willRender = options.renderImages !== false;

  // Preflight: surface a typed OpenAiImageError BEFORE we burn an OpenRouter
  // call on concepts the user can't actually render. The chat UI maps
  // KEY_MISSING to a "set your OpenAI key" banner with a settings link.
  if (willRender) {
    const apiKey = await resolveOpenAiApiKeyForFeature('ad_image_generation');
    if (!apiKey) {
      throw new OpenAiImageError(
        'KEY_MISSING',
        'OpenAI API key is not configured. Add a key in Cortex settings → AI credentials before generating images.',
      );
    }
  }

  const [brandContext, assetsResult, referenceAds] = await Promise.all([
    getBrandContext(options.clientId, { bypassCache: true }),
    admin
      .from('ad_assets')
      .select('id, kind, label, notes, tags')
      .eq('client_id', options.clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    getBrandContext(options.clientId, { bypassCache: true }).then((ctx) =>
      selectReferenceAdsForBrand(ctx, Math.max(count, 20)),
    ),
  ]);

  const assets = assetsResult.data ?? [];
  const imageModel = process.env.CHATGPT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';

  const { data: batchRow, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: options.clientId,
      status: 'generating',
      total_count: count,
      completed_count: 0,
      failed_count: 0,
      config: {
        pipeline,
        user_prompt: options.prompt,
        reference_ad_ids: referenceAds.map((r) => r.id),
        asset_ids: assets.map((a) => a.id),
        image_model: imageModel,
        render_images: willRender,
      },
      brand_context_source: 'brand_dna',
      created_by: options.userId ?? null,
    })
    .select('id')
    .single();

  if (batchErr || !batchRow) {
    throw new Error(`Failed to create batch: ${batchErr?.message ?? 'unknown'}`);
  }

  try {
    const { data: slugStart, error: slugErr } = await admin.rpc('reserve_ad_concept_slugs', {
      p_client_id: options.clientId,
      p_count: count,
    });
    if (slugErr || typeof slugStart !== 'number') {
      throw new Error(`Slug reservation failed: ${slugErr?.message ?? 'unknown'}`);
    }

    const systemPrompt = buildSystemPrompt({
      count,
      brandBlock: brandContext.toPromptBlock(),
      assets,
      referenceAds,
      renderImages: willRender,
    });

    const completion = await createOpenRouterRichCompletion({
      feature: 'monthly_gift_ad_concepts',
      userId: options.userId ?? undefined,
      modelPreference: [CONCEPT_MODEL],
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.prompt },
      ],
      temperature: 0.75,
      maxTokens: 9000,
    });

    const rawConcepts = parseConcepts(completion.text ?? '').slice(0, count);
    if (rawConcepts.length === 0) {
      throw new Error('Model returned no parseable concepts');
    }

    const referenceIds = new Set(referenceAds.map((r) => r.id));
    const rows = rawConcepts.map((concept, idx) => {
      const referenceId = strOrNull(concept.reference_ad_id);
      return {
        client_id: options.clientId,
        batch_id: batchRow.id,
        slug: `concept-${String(slugStart + idx).padStart(3, '0')}`,
        template_name: strOr(concept.template_name, 'Reference-driven static ad'),
        headline: strOr(concept.headline, 'Untitled concept'),
        body_copy: strOrNull(concept.body_copy),
        visual_description: strOrNull(concept.visual_description),
        source_grounding: strOr(concept.source_grounding, 'Grounded in Brand DNA and matched reference ads'),
        image_prompt: strOr(concept.image_prompt, ''),
        reference_ad_id: referenceId && referenceIds.has(referenceId) ? referenceId : null,
        status: 'pending',
        position: idx,
        pipeline,
        generation_model: CONCEPT_MODEL,
        metadata: {
          reference_model: 'matched_reference_ads',
          requested_count: count,
        },
      };
    });

    const { data: inserted, error: insertErr } = await admin
      .from('ad_concepts')
      .insert(rows)
      .select(
        'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
      );
    if (insertErr || !inserted) {
      throw new Error(`Concept insert failed: ${insertErr?.message ?? 'unknown'}`);
    }

    let completed = inserted.length;
    let failed = count - inserted.length;
    let renderError: OpenAiImageError | null = null;
    if (willRender) {
      const renderResult = await renderConceptsWithLimit(
        inserted.map((c) => c.id),
        2,
        { userId: options.userId ?? null, userEmail: options.userEmail ?? null },
      );
      completed = renderResult.ok;
      failed = inserted.length - renderResult.ok + (count - inserted.length);
      renderError = renderResult.terminalError;
    }

    const partial = failed > 0 || inserted.length < count;
    await admin
      .from('ad_generation_batches')
      .update({
        status: partial ? 'partial' : 'completed',
        completed_count: completed,
        failed_count: failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchRow.id);

    await admin.from('ad_generator_messages').insert([
      {
        client_id: options.clientId,
        role: 'user',
        content: options.prompt,
        author_user_id: options.userId ?? null,
      },
      {
        client_id: options.clientId,
        role: 'assistant',
        content: `Generated ${inserted.length} reference-driven ad${inserted.length === 1 ? '' : 's'} with gpt-image-2${partial ? ' (partial)' : ''}.`,
        batch_id: batchRow.id,
        metadata: {
          requested: count,
          returned: inserted.length,
          rendered: willRender,
          reference_ad_ids: referenceAds.map((r) => r.id),
          partial,
          render_error_code: renderError?.code ?? null,
        },
        author_user_id: options.userId ?? null,
      },
    ]);

    // Bubble up a terminal OpenAI error so the route returns the structured
    // code (key missing, quota exhausted, auth failed, content blocked) and
    // the chat surfaces an actionable message — even though some concepts
    // were inserted, the batch is unusable without imagery.
    if (renderError) throw renderError;

    const { data: refreshed } = await admin
      .from('ad_concepts')
      .select(
        'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
      )
      .in('id', inserted.map((c) => c.id))
      .order('position', { ascending: true });

    return {
      batchId: batchRow.id,
      status: partial ? 'partial' : 'completed',
      concepts: (refreshed ?? inserted) as GeneratedConceptRow[],
      referenceAds,
    };
  } catch (err) {
    await admin
      .from('ad_generation_batches')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', batchRow.id);
    throw err;
  }
}

interface RenderAttribution {
  userId?: string | null;
  userEmail?: string | null;
}

export async function renderConceptImageWithOpenAI(
  conceptId: string,
  attribution: RenderAttribution = {},
): Promise<GeneratedConceptRow> {
  const admin = createAdminClient();
  const { data: concept } = await admin
    .from('ad_concepts')
    .select('id, client_id, image_prompt, image_storage_path')
    .eq('id', conceptId)
    .maybeSingle();
  if (!concept) throw new Error('Concept not found');
  if (!concept.image_prompt) throw new Error('Concept has no image prompt');

  let result: Awaited<ReturnType<typeof generateOpenAiAdImage>>;
  try {
    result = await generateOpenAiAdImage({
      prompt: concept.image_prompt as string,
      aspectRatio: '1:1',
      feature: 'ad_image_generation',
    });
  } catch (err) {
    // Log a 0-token failure row so the usage dashboard surfaces incidents
    // (rate-limited, quota-exhausted, content-blocked) alongside successful
    // renders. The metadata.error_code lets us filter for "renders that
    // didn't bill" later.
    if (err instanceof OpenAiImageError) {
      trackUsage({
        service: 'openai',
        model: process.env.CHATGPT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
        feature: 'ad_image_generation',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        userId: attribution.userId ?? undefined,
        userEmail: attribution.userEmail ?? undefined,
        metadata: {
          concept_id: concept.id,
          client_id: concept.client_id,
          error_code: err.code,
          provider_message: err.providerMessage,
          status: 'failed',
        },
      });
    }
    throw err;
  }

  if (concept.image_storage_path) {
    await admin.storage.from('ad-creatives').remove([concept.image_storage_path as string]);
  }

  const storagePath = `${concept.client_id}/concepts/${concept.id}/${randomUUID()}.png`;
  const { error: uploadErr } = await admin.storage
    .from('ad-creatives')
    .upload(storagePath, result.image, {
      contentType: 'image/png',
      upsert: false,
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: updated, error: updateErr } = await admin
    .from('ad_concepts')
    .update({
      image_storage_path: storagePath,
      generation_model: result.model,
      metadata: {
        image_model: result.model,
        image_quality: result.quality,
        image_size: result.size,
        rendered_at: new Date().toISOString(),
        cost_usd: result.estimatedCostUsd,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
    })
    .eq('id', concept.id)
    .select(
      'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
    )
    .single();

  if (updateErr || !updated) {
    await admin.storage.from('ad-creatives').remove([storagePath]);
    throw new Error(`Update failed: ${updateErr?.message ?? 'unknown'}`);
  }

  // Successful render — log usage with estimated cost. When OpenAI returns
  // token counts, we record those too; when it doesn't, the cost still lands
  // via the static price table so the dashboard reflects spend.
  trackUsage({
    service: 'openai',
    model: result.model,
    feature: 'ad_image_generation',
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.inputTokens + result.outputTokens,
    costUsd: result.estimatedCostUsd,
    userId: attribution.userId ?? undefined,
    userEmail: attribution.userEmail ?? undefined,
    metadata: {
      concept_id: concept.id,
      client_id: concept.client_id,
      quality: result.quality,
      size: result.size,
      cost_basis: 'estimated', // flip to 'reconciled' once we have a usage webhook
      estimated_cost_lookup: estimateImageCostUsd(result.model, result.quality, result.size),
    },
  });

  return updated as GeneratedConceptRow;
}

interface BatchRenderResult {
  ok: number;
  failed: number;
  /**
   * If a render hit a terminal OpenAI error (key missing, quota exhausted,
   * auth failed, content blocked) we surface the FIRST one so the batch can
   * fail fast instead of grinding through 19 more identical errors. Transient
   * errors (rate-limited, generic 5xx) don't populate this — we want those to
   * stay best-effort.
   */
  terminalError: OpenAiImageError | null;
}

async function renderConceptsWithLimit(
  ids: string[],
  limit: number,
  attribution: RenderAttribution,
): Promise<BatchRenderResult> {
  let ok = 0;
  let failed = 0;
  let terminalError: OpenAiImageError | null = null;
  const queue = [...ids];

  async function worker() {
    while (queue.length > 0) {
      // If a terminal error already popped, drain the queue without retrying.
      if (terminalError) {
        failed += queue.length;
        queue.length = 0;
        return;
      }
      const id = queue.shift();
      if (!id) return;
      try {
        await renderConceptImageWithOpenAI(id, attribution);
        ok++;
      } catch (err) {
        failed++;
        console.error('[monthly-gift-ads] render failed:', id, err);
        if (err instanceof OpenAiImageError && isTerminalForBatch(err.code)) {
          terminalError = err;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, () => worker()));
  return { ok, failed, terminalError };
}

function isTerminalForBatch(code: OpenAiImageError['code']): boolean {
  return (
    code === 'KEY_MISSING' ||
    code === 'AUTH_FAILED' ||
    code === 'QUOTA_EXHAUSTED'
  );
}

function parseConcepts(raw: string): RawConcept[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (Array.isArray(parsed)) return parsed as RawConcept[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { concepts?: unknown }).concepts)) {
      return (parsed as { concepts: RawConcept[] }).concepts;
    }
  } catch {
    return [];
  }
  return [];
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

interface PromptInputs {
  count: number;
  brandBlock: string;
  assets: Array<{ id: string; kind: string; label: string; notes: string | null; tags: string[] | null }>;
  referenceAds: ReferenceAd[];
  renderImages: boolean;
}

/**
 * System prompt for the concept-generation step. The image_prompt rules are
 * pulled from OpenAI's gpt-image-2 prompting guide (background → subject →
 * details → constraints; on-image text in quotes; explicit framing/lighting;
 * exclude watermarks/clip-art) so the prompts we emit are immediately
 * render-ready instead of needing a second pass.
 */
function buildSystemPrompt({ count, brandBlock, assets, referenceAds, renderImages }: PromptInputs): string {
  const assetManifest =
    assets.length === 0
      ? '(none uploaded)'
      : assets
          .map((a) => {
            const tagBlock = a.tags && a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
            return `- (${a.kind}) "${a.label}"${tagBlock}${a.notes ? ` — ${a.notes}` : ''}`;
          })
          .join('\n');

  return `You are Nativz Cortex's monthly performance-ad system. Create ${count} static ads as a client gift.

The ads must feel like they came from the brand, but their structures should be inspired by proven reference ads that have historically performed well.

# Brand DNA

${brandBlock}

# Uploaded brand assets

${assetManifest}

# Matched proven reference ads

${formatReferenceAdsForPrompt(referenceAds)}

# Concept requirements

- Produce exactly ${count} concepts.
- Each concept must use one matched reference ad when available. Put that row's UUID in reference_ad_id.
- Do not copy another brand's logo, product, copy, claims, testimonials, or proprietary marks.
- Borrow only the reusable mechanism: layout, pacing, hierarchy, emotional angle, CTA treatment, offer framing, visual rhythm.
- Ground claims in Brand DNA or uploaded assets only. If a claim is not supported, make it softer.
- Vary the batch: testimonial/social proof, problem-solution, offer, comparison, stat callout, product/service showcase, founder/authority, and FAQ/objection.
- ${renderImages
  ? 'These prompts will be rendered immediately, so keep them visually concrete and avoid vague art direction.'
  : 'These prompts may be rendered later, so keep them inspectable and editable.'}

# image_prompt rules (gpt-image-2)

Each image_prompt must read like a creative brief for a real photographer, not concept-art language. Follow this structure in order:

1. Scene & background — physical setting, surface, environment.
2. Subject — what is featured (product, person, object, abstract composition). Name camera framing (close-up, medium, wide), viewpoint (eye-level, low-angle, top-down), and lighting (soft diffuse, golden hour, studio key + fill).
3. On-image text — write the EXACT copy in quotes, e.g. headline "Sleep deeper tonight" rendered verbatim. Specify font character (sans / serif / display), size relative to the ad, color, and placement (top-left, lower third, etc.). For tricky words, spell out letter-by-letter.
4. Brand identity — describe brand personality and palette in plain English (warm earth tones, energetic neon accent on charcoal, premium muted neutrals). Avoid hex codes; let the model interpret tasteful color direction. Place the logo only if Brand DNA confirms a clean lockup, and name its location ("logo bottom-right, small").
5. Composition & layout — name the visual hierarchy ("subject centered, headline lower third, CTA pill bottom-right"). Reference the borrowed reference-ad mechanic by feel, not by name.
6. Constraints — list what must NOT appear: "no watermarks, no extra logos, no clip-art icons, no stock-photo feeling, no decorative gradients, no unrelated text".
7. Render mode — for photoreal ads include "photorealistic, professional campaign photography"; for graphic ads include "flat editorial illustration" or "clean magazine layout".

Quality is set to medium by default. Only the BAD_REQUEST hint "small dense type" warrants the high tier — keep prompts tight enough that medium reads cleanly.

# Output JSON

Return only JSON:

{
  "concepts": [
    {
      "reference_ad_id": "uuid from the matched reference list, or null if no reference library exists",
      "template_name": "short pattern name",
      "headline": "main on-screen headline",
      "body_copy": "supporting on-screen text or null",
      "visual_description": "plain-English description of the final ad",
      "source_grounding": "specific Brand DNA, asset label, or reference ad reason",
      "image_prompt": "full gpt-image-2 prompt following the rules above"
    }
  ]
}`;
}
