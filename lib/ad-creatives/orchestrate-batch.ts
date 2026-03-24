// ---------------------------------------------------------------------------
// Static Ad Generation — Batch Orchestrator
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assertBrandDnaGuidelineForAdGeneration } from '@/lib/ad-creatives/require-brand-dna-for-generation';
import { assembleImagePrompt } from './assemble-prompt';
import { generateAdImage } from './generate-image';
import { generateAdCopy, generateAdCopyBatched } from './generate-copy';
import { generateCreativeBrief } from './generate-creative-brief';
import { buildLayoutWireframePng } from './layout-wireframe';
import { qaCheckAd, type QAIssue } from './qa-check';
import { buildQaRetryStyleSuffix } from './qa-retry-hint';
import { getClientAdGenerationSettings } from './client-ad-generation-settings';
import { buildNanoBananaImagePrompt } from './nano-banana/build-nano-prompt';
import { fillNanoBananaTemplate } from './nano-banana/fill-template';
import { assertValidNanoBananaSlugs, getNanoBananaBySlug } from './nano-banana/catalog';
import {
  brandLogoImageUrlsForGeneration,
  supplementaryBrandReferenceImageUrls,
} from './brand-reference-images';
import { slotOnScreenText, slotProductServiceOffer } from './slot-product-context';
import { ASPECT_RATIOS } from './types';
import type {
  AdGenerationBatch,
  AdGenerationConfig,
  AdPromptSchema,
  AdPromptTemplate,
  CreativeOverride,
  OnScreenText,
} from './types';

const MAX_CONCURRENCY = 3;

async function fetchAdBatchStatus(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('ad_generation_batches')
    .select('status')
    .eq('id', batchId)
    .maybeSingle();
  const row = data as { status?: string } | null;
  return row?.status ?? null;
}

/** Update counts when status is already `cancelled` (set by API). */
async function applyCancelledBatchProgress(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
  completedCount: number,
  failedCount: number,
): Promise<void> {
  await admin
    .from('ad_generation_batches')
    .update({
      completed_count: completedCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run a full ad generation batch. Reads config from the database, generates
 * images for each template x variation combination, uploads results to
 * Supabase Storage, and creates ad_creatives records.
 */
export async function runGenerationBatch(batchId: string): Promise<void> {
  const admin = createAdminClient();

  // 1. Load batch record
  const { data: batch, error: batchError } = await admin
    .from('ad_generation_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(`Batch ${batchId} not found: ${batchError?.message ?? 'no data'}`);
  }

  const typedBatch = batch as AdGenerationBatch;
  const config = typedBatch.config as AdGenerationConfig;
  const isGlobalNano = (config.globalTemplateVariations?.length ?? 0) > 0;

  if (typedBatch.status === 'cancelled') {
    console.warn(`[orchestrate-batch] batch ${batchId}: already cancelled — skipping run`);
    return;
  }

  console.log(`[orchestrate-batch] starting batch ${batchId} for client ${typedBatch.client_id}`);

  // Mark as generating
  await admin
    .from('ad_generation_batches')
    .update({ status: 'generating' })
    .eq('id', batchId);

  try {
    // 2. Resolve brand context (fresh read — batch may have been queued before DNA existed)
    const brandContext = await getBrandContext(typedBatch.client_id, { bypassCache: true });
    assertBrandDnaGuidelineForAdGeneration(brandContext);

    if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
      await applyCancelledBatchProgress(admin, batchId, 0, 0);
      return;
    }

    // 3. Client modifier (Nano path — concatenated first in text prompt)
    const adGenSettings = await getClientAdGenerationSettings(typedBatch.client_id);

    // 4. Resolve templates (client UUID rows vs global Nano Banana catalog)
    const clientTemplates = isGlobalNano ? [] : await resolveTemplates(config, typedBatch.client_id);
    const globalEntries = isGlobalNano ? resolveGlobalNanoEntries(config) : [];

    // 4. Generate copy if needed (skipped when full creativeOverrides from prompt review)
    const expectedSlots = expectedWorkItemCount(config);
    const overrides = config.creativeOverrides;
    const fullReview =
      !!overrides?.length &&
      overrides.length === expectedSlots;

    const overrideMap = fullReview ? buildCreativeOverrideMap(overrides) : null;

    const copyPoolSize = fullReview ? 1 : expectedSlots;
    const fixedCta = config.batchCta?.trim() ? config.batchCta.trim() : null;

    let copyVariations: OnScreenText[] = [];
    if (!fullReview) {
      if (config.onScreenText === 'ai_generate') {
        console.log(
          `[orchestrate-batch] batch ${batchId}: generating AI on-screen copy for ${copyPoolSize} slot(s) (may take several minutes for large batches)…`,
        );
        copyVariations =
          copyPoolSize > 36
            ? await generateAdCopyBatched({
                brandContext,
                productService: config.productService,
                offer: config.offer || null,
                count: copyPoolSize,
                fixedCta,
              })
            : await generateAdCopy({
                brandContext,
                productService: config.productService,
                offer: config.offer || null,
                count: Math.max(copyPoolSize, 1),
                fixedCta,
              });
        console.log(
          `[orchestrate-batch] batch ${batchId}: copy ready (${copyVariations.length} variation(s))`,
        );
      } else {
        const staticText = config.onScreenText as OnScreenText;
        copyVariations = Array.from({ length: copyPoolSize }, () => staticText);
      }
    } else {
      copyVariations = [{ headline: ' ', subheadline: ' ', cta: ' ' }];
    }

    if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
      await applyCancelledBatchProgress(admin, batchId, 0, 0);
      return;
    }

    // 5. Build work items (template x variation)
    const workItems = isGlobalNano
      ? buildGlobalWorkItems(globalEntries, copyVariations, config, overrideMap)
      : buildClientWorkItems(clientTemplates, copyVariations, config, overrideMap);

    console.log(
      `[orchestrate-batch] batch ${batchId}: ${workItems.length} work items ` +
        (isGlobalNano ? `(Nano global × ${globalEntries.length} styles)` : `across ${clientTemplates.length} template(s)`),
    );

    // Update total count based on actual work items
    await admin
      .from('ad_generation_batches')
      .update({ total_count: workItems.length })
      .eq('id', batchId);

    if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
      await applyCancelledBatchProgress(admin, batchId, 0, 0);
      return;
    }

    // 6. Dimensions + product refs for multimodal (no post-render compositing)
    const dimensions = ASPECT_RATIOS.find((r) => r.value === config.aspectRatio) ?? ASPECT_RATIOS[0];
    const fullCtx = brandContext.toFullContext();
    const vi = fullCtx.visualIdentity;

    const rawProductUrls: string[] = [];
    if (config.productImageUrls && config.productImageUrls.length > 0) {
      rawProductUrls.push(...config.productImageUrls);
    } else if (vi.screenshots.length > 0) {
      rawProductUrls.push(...vi.screenshots.slice(0, 2).map((s) => s.url));
    }
    const rotateProductRefs =
      config.rotateProductImageUrls === true && rawProductUrls.length > 1;

    const layoutMode = isGlobalNano ? 'schema_only' : (config.brandLayoutMode ?? 'reference_image');

    let creativeBriefParagraph = config.creativeBrief?.trim() ?? '';
    if (!creativeBriefParagraph) {
      creativeBriefParagraph = (
        await generateCreativeBrief({
          brandContext,
          productService: config.productService,
          offer: config.offer || null,
        })
      ).trim();
      if (creativeBriefParagraph) {
        const nextConfig: AdGenerationConfig = { ...config, creativeBrief: creativeBriefParagraph };
        await admin
          .from('ad_generation_batches')
          .update({ config: nextConfig as unknown as Record<string, unknown> })
          .eq('id', batchId);
        Object.assign(config, nextConfig);
      }
    }

    if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
      await applyCancelledBatchProgress(admin, batchId, 0, 0);
      return;
    }

    // 7. Process with concurrency control
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(
      workItems,
      MAX_CONCURRENCY,
      async (item, itemIndex) => {
        if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
          return;
        }
        try {
          const MAX_QA_RETRIES = 2;
          let imageBuffer: Buffer | null = null;
          let lastPrompt = '';
          let qaResult = { passed: true, issues: [] as { type: string; description: string }[], extractedText: [] as string[], confidence: 0 };
          let qaRetryStyleSuffix = '';
          const ost = slotOnScreenText(item.onScreenText, itemIndex, config);
          const slotCtx = slotProductServiceOffer(itemIndex, config);

          for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
            if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
              return;
            }
            const styleDirection = [item.styleDirection, qaRetryStyleSuffix].filter(Boolean).join('\n\n');
            const logoUrls = brandLogoImageUrlsForGeneration(brandContext);
            const brandRefs = supplementaryBrandReferenceImageUrls(brandContext, logoUrls);
            const refUrl =
              item.mode === 'client' && layoutMode === 'reference_image'
                ? item.referenceImageUrl ?? undefined
                : undefined;

            let layoutWireframePng: Buffer | undefined;
            if (item.mode === 'client' && layoutMode === 'schema_plus_wireframe') {
              layoutWireframePng = await buildLayoutWireframePng(
                dimensions.width,
                dimensions.height,
                item.promptSchema,
              );
            }

            let prompt: string;
            if (item.mode === 'global') {
              const filled = fillNanoBananaTemplate(item.nanoPromptTemplate, {
                onScreenText: ost,
                productService: slotCtx.productService,
                offer: slotCtx.offer ?? '',
              });
              prompt = buildNanoBananaImagePrompt({
                imagePromptModifier: adGenSettings.image_prompt_modifier,
                brandContext,
                filledTemplateBody: filled,
                aspectRatio: config.aspectRatio,
                productService: slotCtx.productService,
                offer: slotCtx.offer || null,
                creativeBrief: creativeBriefParagraph || undefined,
                styleDirection: styleDirection || undefined,
              });
            } else {
              prompt = assembleImagePrompt({
                brandContext,
                promptSchema: item.promptSchema,
                productService: slotCtx.productService,
                offer: slotCtx.offer || null,
                onScreenText: ost,
                aspectRatio: config.aspectRatio,
                styleDirection: styleDirection || undefined,
                creativeBrief: creativeBriefParagraph || undefined,
              });
            }
            lastPrompt = prompt;

            const productUrlsThisSlot =
              rawProductUrls.length === 0
                ? undefined
                : rotateProductRefs
                  ? [rawProductUrls[itemIndex % rawProductUrls.length]]
                  : rawProductUrls.slice(0, 3);

            imageBuffer = await generateAdImage({
              prompt,
              referenceImageUrl: refUrl,
              layoutWireframePng,
              productImageUrls: productUrlsThisSlot,
              brandLogoImageUrls: logoUrls.length > 0 ? logoUrls : undefined,
              brandReferenceImageUrls: brandRefs.length > 0 ? brandRefs : undefined,
              aspectRatio: config.aspectRatio,
            });

            // QA: verify text is about the right brand, not copied from reference
            qaResult = await qaCheckAd({
              imageBuffer,
              intendedText: ost,
              offer: slotCtx.offer || null,
              brandName: brandContext.clientName,
              productService: slotCtx.productService,
              canonicalClientWebsiteUrl: brandContext.clientWebsiteUrl,
              expectedWidth: dimensions.width,
              expectedHeight: dimensions.height,
            });

            if (qaResult.passed) break;

            console.warn(
              `[orchestrate-batch] QA failed (attempt ${attempt + 1}): ${qaResult.issues.map(i => i.description).join('; ')}`,
            );

            if (attempt < MAX_QA_RETRIES) {
              qaRetryStyleSuffix = buildQaRetryStyleSuffix(qaResult.issues as QAIssue[]);
            }
          }

          if (!imageBuffer) throw new Error('No image generated');

          // Upload to Supabase Storage
          const creativeId = crypto.randomUUID();
          const storagePath = `${typedBatch.client_id}/${batchId}/${creativeId}.png`;

          const { error: uploadError } = await admin.storage
            .from('ad-creatives')
            .upload(storagePath, imageBuffer, {
              contentType: 'image/png',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          // Get the public URL
          const { data: urlData } = admin.storage
            .from('ad-creatives')
            .getPublicUrl(storagePath);

          const imageUrl = urlData.publicUrl;

          // Create ad_creatives record
          const { error: insertError } = await admin.from('ad_creatives').insert({
            id: creativeId,
            batch_id: batchId,
            client_id: typedBatch.client_id,
            template_id: item.mode === 'global' ? null : item.templateKey,
            template_source: item.mode === 'global' ? 'global' : 'custom',
            image_url: imageUrl,
            aspect_ratio: config.aspectRatio,
            prompt_used: lastPrompt,
            on_screen_text: ost,
            product_service: slotCtx.productService,
            offer: slotCtx.offer ?? '',
            is_favorite: false,
            metadata: {
              model: process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview',
              brand_layout_mode: layoutMode,
              image_pipeline: item.mode === 'global' ? 'nano_banana' : 'gemini_native',
              batch_item_index: itemIndex,
              qa_passed: qaResult.passed,
              qa_score: qaResult.confidence,
              qa_issues: qaResult.issues.length > 0 ? qaResult.issues : undefined,
              ...(item.mode === 'global' ? { global_slug: item.templateKey } : {}),
            },
          });

          if (insertError) {
            throw new Error(`Failed to insert creative record: ${insertError.message}`);
          }

          completedCount++;
        } catch (err) {
          failedCount++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[orchestrate-batch] creative failed — batchId=${batchId} templateKey=${item.templateKey}: ${msg}`,
          );
        }

        // Update progress after each creative (success or failure)
        await admin
          .from('ad_generation_batches')
          .update({
            completed_count: completedCount,
            failed_count: failedCount,
          })
          .eq('id', batchId)
          .then(({ error }) => {
            if (error) console.error('[orchestrate-batch] progress update failed:', error.message);
          });
      },
    );

    // 9. Finalize batch status
    if ((await fetchAdBatchStatus(admin, batchId)) === 'cancelled') {
      await applyCancelledBatchProgress(admin, batchId, completedCount, failedCount);
      console.warn(
        `[orchestrate-batch] batch ${batchId}: cancelled — completed=${completedCount}, failed=${failedCount}`,
      );
      return;
    }

    const finalStatus =
      failedCount === 0
        ? 'completed'
        : completedCount === 0
          ? 'failed'
          : 'partial';

    await admin
      .from('ad_generation_batches')
      .update({
        status: finalStatus,
        completed_count: completedCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    console.log(
      `[orchestrate-batch] batch ${batchId} finished: status=${finalStatus}, completed=${completedCount}, failed=${failedCount}`,
    );
  } catch (err) {
    console.error('[orchestrate-batch] batch failed catastrophically:', err);
    const st = await fetchAdBatchStatus(admin, batchId);
    if (st !== 'cancelled') {
      await admin
        .from('ad_generation_batches')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

interface ResolvedTemplate {
  id: string;
  promptSchema: AdPromptSchema;
  referenceImageUrl: string | null;
}

interface ResolvedGlobalTemplate {
  slug: string;
  name: string;
  promptTemplate: string;
}

function resolveGlobalNanoEntries(config: AdGenerationConfig): ResolvedGlobalTemplate[] {
  const gtv = config.globalTemplateVariations ?? [];
  const slugs = [...new Set(gtv.map((g) => g.slug))];
  assertValidNanoBananaSlugs(slugs);
  return slugs.map((slug) => {
    const entry = getNanoBananaBySlug(slug);
    if (!entry) throw new Error(`Missing Nano catalog entry: ${slug}`);
    return {
      slug: entry.slug,
      name: entry.name,
      promptTemplate: entry.promptTemplate,
    };
  });
}

async function resolveTemplates(
  config: AdGenerationConfig,
  clientId: string,
): Promise<ResolvedTemplate[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('ad_prompt_templates')
    .select('*')
    .eq('client_id', clientId)
    .in('id', config.templateIds);

  if (error) throw new Error(`Failed to fetch ad templates: ${error.message}`);

  const rows = (data ?? []) as AdPromptTemplate[];
  if (rows.length !== config.templateIds.length) {
    throw new Error(
      'One or more templates were not found for this client. They may have been deleted after the batch was queued.',
    );
  }

  return rows.map((t) => ({
    id: t.id,
    promptSchema: t.prompt_schema,
    referenceImageUrl: t.reference_image_url,
  }));
}

// ---------------------------------------------------------------------------
// Work item builder
// ---------------------------------------------------------------------------

type WorkItem =
  | {
      mode: 'client';
      templateKey: string;
      promptSchema: AdPromptSchema;
      referenceImageUrl: string | null;
      onScreenText: OnScreenText;
      styleDirection?: string;
    }
  | {
      mode: 'global';
      templateKey: string;
      nanoPromptTemplate: string;
      onScreenText: OnScreenText;
      styleDirection?: string;
    };

function overrideKey(templateId: string, variationIndex: number): string {
  return `${templateId}:${variationIndex}`;
}

function expectedWorkItemCount(config: AdGenerationConfig): number {
  if (config.globalTemplateSlotOrder && config.globalTemplateSlotOrder.length > 0) {
    return config.globalTemplateSlotOrder.length;
  }
  if (config.globalTemplateVariations && config.globalTemplateVariations.length > 0) {
    return config.globalTemplateVariations.reduce((sum, g) => sum + g.count, 0);
  }
  if (config.templateVariations && config.templateVariations.length > 0) {
    return config.templateVariations.reduce((sum, tv) => sum + tv.count, 0);
  }
  const n = config.templateIds?.length ?? 0;
  return n * (config.numVariations ?? 2);
}

/**
 * Returns a map when creativeOverrides is a non-empty, complete set for every
 * template × variation slot; otherwise null (fall back to AI/manual pool).
 */
function buildCreativeOverrideMap(
  overrides: CreativeOverride[] | undefined,
): Map<string, { onScreenText: OnScreenText; styleDirection?: string }> | null {
  if (!overrides?.length) return null;
  const map = new Map<string, { onScreenText: OnScreenText; styleDirection?: string }>();
  for (const o of overrides) {
    map.set(overrideKey(o.templateId, o.variationIndex), {
      onScreenText: {
        headline: o.headline,
        subheadline: o.subheadline,
        cta: o.cta,
      },
      styleDirection: o.styleNotes?.trim() || undefined,
    });
  }
  return map;
}

function buildGlobalWorkItems(
  entries: ResolvedGlobalTemplate[],
  copyVariations: OnScreenText[],
  config: AdGenerationConfig,
  overrideMap: Map<string, { onScreenText: OnScreenText; styleDirection?: string }> | null,
): WorkItem[] {
  const items: WorkItem[] = [];
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  const globalStyle = config.styleDirectionGlobal?.trim() || undefined;
  const slotOrder = config.globalTemplateSlotOrder;

  if (slotOrder?.length) {
    const slugNextIdx = new Map<string, number>();
    for (let pos = 0; pos < slotOrder.length; pos++) {
      const slug = slotOrder[pos];
      const entry = entryBySlug.get(slug);
      if (!entry) continue;
      const i = slugNextIdx.get(slug) ?? 0;
      slugNextIdx.set(slug, i + 1);
      const fromOverride = overrideMap?.get(overrideKey(entry.slug, i));
      const fallback =
        copyVariations[pos] ?? copyVariations[pos % Math.max(copyVariations.length, 1)];
      const copy = fromOverride?.onScreenText ?? fallback;
      items.push({
        mode: 'global',
        templateKey: entry.slug,
        nanoPromptTemplate: entry.promptTemplate,
        onScreenText: copy,
        styleDirection: fromOverride?.styleDirection ?? globalStyle,
      });
    }
    return items;
  }

  const gtv = config.globalTemplateVariations ?? [];
  for (const tv of gtv) {
    const entry = entryBySlug.get(tv.slug);
    if (!entry) continue;
    for (let i = 0; i < tv.count; i++) {
      const fromOverride = overrideMap?.get(overrideKey(entry.slug, i));
      const copy = fromOverride?.onScreenText ?? copyVariations[i % Math.max(copyVariations.length, 1)];
      items.push({
        mode: 'global',
        templateKey: entry.slug,
        nanoPromptTemplate: entry.promptTemplate,
        onScreenText: copy,
        styleDirection: fromOverride?.styleDirection ?? globalStyle,
      });
    }
  }
  return items;
}

function buildClientWorkItems(
  templates: ResolvedTemplate[],
  copyVariations: OnScreenText[],
  config: AdGenerationConfig,
  overrideMap: Map<string, { onScreenText: OnScreenText; styleDirection?: string }> | null,
): WorkItem[] {
  const items: WorkItem[] = [];
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const globalStyle = config.styleDirectionGlobal?.trim() || undefined;

  /** Match preview-prompts + wizard: same order as `templateVariations` (not DB `.in()` order). */
  if (config.templateVariations && config.templateVariations.length > 0) {
    for (const tv of config.templateVariations) {
      const template = templateById.get(tv.templateId);
      if (!template) continue;
      for (let i = 0; i < tv.count; i++) {
        const fromOverride = overrideMap?.get(overrideKey(template.id, i));
        const copy = fromOverride?.onScreenText ?? copyVariations[i % copyVariations.length];
        items.push({
          mode: 'client',
          templateKey: template.id,
          promptSchema: template.promptSchema,
          referenceImageUrl: template.referenceImageUrl,
          onScreenText: copy,
          styleDirection: fromOverride?.styleDirection ?? globalStyle,
        });
      }
    }
    return items;
  }

  for (const template of templates) {
    const count = config.numVariations ?? copyVariations.length;
    for (let i = 0; i < count; i++) {
      const fromOverride = overrideMap?.get(overrideKey(template.id, i));
      const copy = fromOverride?.onScreenText ?? copyVariations[i % copyVariations.length];
      items.push({
        mode: 'client',
        templateKey: template.id,
        promptSchema: template.promptSchema,
        referenceImageUrl: template.referenceImageUrl,
        onScreenText: copy,
        styleDirection: fromOverride?.styleDirection ?? globalStyle,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Concurrency control (simple semaphore)
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  items: T[],
  maxConcurrent: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let activeCount = 0;
  let index = 0;

  return new Promise<void>((resolve) => {
    if (items.length === 0) {
      resolve();
      return;
    }

    let settled = 0;

    function next() {
      while (activeCount < maxConcurrent && index < items.length) {
        const currentIndex = index++;
        activeCount++;

        fn(items[currentIndex], currentIndex)
          .catch((err) => {
            // Errors are handled inside the fn callback, but catch here for safety
            console.error('[concurrency] unexpected error in work item:', err);
          })
          .finally(() => {
            activeCount--;
            settled++;

            if (settled === items.length) {
              resolve();
            } else {
              next();
            }
          });
      }
    }

    next();
  });
}
