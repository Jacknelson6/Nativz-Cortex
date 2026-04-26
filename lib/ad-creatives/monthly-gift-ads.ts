import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import {
  formatReferenceAdsForPrompt,
  selectReferenceAdsForBrand,
  type ReferenceAd,
} from '@/lib/ad-creatives/reference-ad-library';
import { generateOpenAiAdImage } from '@/lib/ad-creatives/openai-image';

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
        image_model: process.env.CHATGPT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1.5',
        render_images: options.renderImages !== false,
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
      renderImages: options.renderImages !== false,
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
    if (options.renderImages !== false) {
      const renderResult = await renderConceptsWithLimit(inserted.map((c) => c.id), 2);
      completed = renderResult.ok;
      failed = inserted.length - renderResult.ok + (count - inserted.length);
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
        content: `Generated ${inserted.length} reference-driven ad${inserted.length === 1 ? '' : 's'} with ChatGPT Image${partial ? ' (partial)' : ''}.`,
        batch_id: batchRow.id,
        metadata: {
          requested: count,
          returned: inserted.length,
          rendered: options.renderImages !== false,
          reference_ad_ids: referenceAds.map((r) => r.id),
          partial,
        },
        author_user_id: options.userId ?? null,
      },
    ]);

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

export async function renderConceptImageWithOpenAI(conceptId: string): Promise<GeneratedConceptRow> {
  const admin = createAdminClient();
  const { data: concept } = await admin
    .from('ad_concepts')
    .select('id, client_id, image_prompt, image_storage_path')
    .eq('id', conceptId)
    .maybeSingle();
  if (!concept) throw new Error('Concept not found');
  if (!concept.image_prompt) throw new Error('Concept has no image prompt');

  const result = await generateOpenAiAdImage({
    prompt: concept.image_prompt as string,
    aspectRatio: '1:1',
    feature: 'ad_image_generation',
  });

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

  return updated as GeneratedConceptRow;
}

async function renderConceptsWithLimit(ids: string[], limit: number): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const queue = [...ids];

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) return;
      try {
        await renderConceptImageWithOpenAI(id);
        ok++;
      } catch (err) {
        failed++;
        console.error('[monthly-gift-ads] render failed:', id, err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, () => worker()));
  return { ok, failed };
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

# Requirements

- Produce exactly ${count} concepts.
- Each concept must use one matched reference ad when available. Put that row's UUID in reference_ad_id.
- Do not copy another brand's logo, product, copy, claims, testimonials, or proprietary marks.
- Borrow only the reusable mechanism: layout, pacing, hierarchy, emotional angle, CTA treatment, offer framing, visual rhythm.
- Ground claims in Brand DNA or uploaded assets only. If a claim is not supported, make it softer.
- Vary the batch: testimonial/social proof, problem-solution, offer, comparison, stat callout, product/service showcase, founder/authority, and FAQ/objection.
- The image_prompt must be ready for OpenAI GPT Image generation: precise visual direction, final on-image copy, brand palette, logo placement, product/service depiction, composition, and negative prompts.
- ${renderImages ? 'These prompts will be rendered immediately, so keep them visually concrete and avoid vague art direction.' : 'These prompts may be rendered later, so keep them inspectable and editable.'}

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
      "image_prompt": "full GPT Image prompt for the final static ad"
    }
  ]
}`;
}
