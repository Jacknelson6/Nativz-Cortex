// ---------------------------------------------------------------------------
// Static Ad Generation — Batch Orchestrator
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assembleImagePrompt } from './assemble-prompt';
import { generateAdImage } from './generate-image';
import { generateAdCopy } from './generate-copy';
import { compositeAd } from './composite-ad';
import { qaCheckAd } from './qa-check';
import { ASPECT_RATIOS } from './types';
import type {
  AdGenerationBatch,
  AdGenerationConfig,
  AdPromptTemplate,
  KandyTemplate,
  OnScreenText,
} from './types';

const MAX_CONCURRENCY = 3;

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

  // Mark as generating
  await admin
    .from('ad_generation_batches')
    .update({ status: 'generating' })
    .eq('id', batchId);

  try {
    // 2. Resolve brand context
    const brandContext = await getBrandContext(typedBatch.client_id);

    // 3. Resolve templates
    const templates = await resolveTemplates(config);

    // 4. Generate copy if needed
    let copyVariations: OnScreenText[] = [];
    if (config.onScreenText === 'ai_generate') {
      copyVariations = await generateAdCopy({
        brandContext,
        productService: config.productService,
        offer: config.offer || null,
        count: config.numVariations,
      });
    } else {
      // Use the same provided text for all variations
      const staticText = config.onScreenText as OnScreenText;
      copyVariations = Array.from({ length: config.numVariations }, () => staticText);
    }

    // 5. Build work items (template x variation)
    const workItems = buildWorkItems(templates, copyVariations, config);

    // Update total count based on actual work items
    await admin
      .from('ad_generation_batches')
      .update({ total_count: workItems.length })
      .eq('id', batchId);

    // 6. Resolve dimensions, product images, and logo for compositing
    const dimensions = ASPECT_RATIOS.find((r) => r.value === config.aspectRatio) ?? ASPECT_RATIOS[0];
    const fullCtx = brandContext.toFullContext();
    const vi = fullCtx.visualIdentity;

    // Collect real product images from Brand DNA
    const productImageUrls: string[] = [];
    if (vi.screenshots.length > 0) {
      productImageUrls.push(...vi.screenshots.slice(0, 2).map((s) => s.url));
    }

    // Resolve primary logo URL (composited in post-processing for pixel-perfect branding)
    const primaryLogo = vi.logos.find((l) => l.variant === 'primary') ?? vi.logos[0] ?? null;
    const logoUrl = primaryLogo?.url ?? null;

    // 7. Process with concurrency control
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(
      workItems,
      MAX_CONCURRENCY,
      async (item) => {
        try {
          const MAX_QA_RETRIES = 2;
          let imageBuffer: Buffer | null = null;
          let lastPrompt = '';
          let qaResult = { passed: true, issues: [] as { type: string; description: string }[], extractedText: [] as string[], confidence: 0 };

          for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
            const prompt = assembleImagePrompt({
              brandContext,
              promptSchema: item.promptSchema,
              productService: config.productService,
              offer: config.offer || null,
              onScreenText: item.onScreenText,
              aspectRatio: config.aspectRatio,
            });
            lastPrompt = prompt;

            const baseImageBuffer = await generateAdImage({
              prompt,
              referenceImageUrl: item.referenceImageUrl ?? undefined,
              productImageUrls: productImageUrls.length > 0 ? productImageUrls : undefined,
              aspectRatio: config.aspectRatio,
            });

            if (logoUrl) {
              imageBuffer = await compositeAd({
                baseImage: baseImageBuffer,
                textOverlay: null,
                logoUrl,
                logoPosition: 'bottom-left',
                width: dimensions.width,
                height: dimensions.height,
              });
            } else {
              imageBuffer = baseImageBuffer;
            }

            // QA: verify text is about the right brand, not copied from reference
            qaResult = await qaCheckAd({
              imageBuffer,
              intendedText: item.onScreenText,
              offer: config.offer || null,
              brandName: brandContext.clientName,
              productService: config.productService,
              expectedWidth: dimensions.width,
              expectedHeight: dimensions.height,
            });

            if (qaResult.passed) break;

            console.warn(
              `[orchestrate-batch] QA failed (attempt ${attempt + 1}): ${qaResult.issues.map(i => i.description).join('; ')}`,
            );
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
            template_id: item.templateId,
            template_source: item.templateSource,
            image_url: imageUrl,
            aspect_ratio: config.aspectRatio,
            prompt_used: lastPrompt,
            on_screen_text: item.onScreenText,
            product_service: config.productService,
            offer: config.offer ?? '',
            is_favorite: false,
            metadata: {
              model: 'gemini-3.1-flash-image-preview',
              qa_passed: qaResult.passed,
              qa_score: qaResult.confidence,
              qa_issues: qaResult.issues.length > 0 ? qaResult.issues : undefined,
            },
          });

          if (insertError) {
            throw new Error(`Failed to insert creative record: ${insertError.message}`);
          }

          completedCount++;
        } catch (err) {
          failedCount++;
          console.error(
            `[orchestrate-batch] creative failed for template=${item.templateId}:`,
            err instanceof Error ? err.message : err,
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
    // Catastrophic error — mark batch as failed
    console.error('[orchestrate-batch] batch failed catastrophically:', err);
    await admin
      .from('ad_generation_batches')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

interface ResolvedTemplate {
  id: string;
  source: 'kandy' | 'custom';
  promptSchema: KandyTemplate['prompt_schema'];
  referenceImageUrl: string | null;
}

async function resolveTemplates(config: AdGenerationConfig): Promise<ResolvedTemplate[]> {
  const admin = createAdminClient();

  if (config.templateSource === 'kandy') {
    const { data, error } = await admin
      .from('kandy_templates')
      .select('*')
      .in('id', config.templateIds)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch Kandy templates: ${error.message}`);

    return (data as KandyTemplate[]).map((t) => ({
      id: t.id,
      source: 'kandy' as const,
      promptSchema: t.prompt_schema,
      referenceImageUrl: t.image_url,
    }));
  }

  // Custom templates
  const { data, error } = await admin
    .from('ad_prompt_templates')
    .select('*')
    .in('id', config.templateIds);

  if (error) throw new Error(`Failed to fetch custom templates: ${error.message}`);

  return (data as AdPromptTemplate[]).map((t) => ({
    id: t.id,
    source: 'custom' as const,
    promptSchema: t.prompt_schema,
    referenceImageUrl: t.reference_image_url,
  }));
}

// ---------------------------------------------------------------------------
// Work item builder
// ---------------------------------------------------------------------------

interface WorkItem {
  templateId: string;
  templateSource: 'kandy' | 'custom';
  promptSchema: KandyTemplate['prompt_schema'];
  referenceImageUrl: string | null;
  onScreenText: OnScreenText;
}

function buildWorkItems(
  templates: ResolvedTemplate[],
  copyVariations: OnScreenText[],
  config: AdGenerationConfig,
): WorkItem[] {
  const items: WorkItem[] = [];

  // Use per-template variation counts if available (v2), otherwise fall back to uniform count
  const variationMap = new Map<string, number>();
  if (config.templateVariations && config.templateVariations.length > 0) {
    for (const tv of config.templateVariations) {
      variationMap.set(tv.templateId, tv.count);
    }
  }

  for (const template of templates) {
    const count = variationMap.get(template.id) ?? config.numVariations ?? copyVariations.length;
    for (let i = 0; i < count; i++) {
      const copy = copyVariations[i % copyVariations.length];
      items.push({
        templateId: template.id,
        templateSource: template.source,
        promptSchema: template.promptSchema,
        referenceImageUrl: template.referenceImageUrl,
        onScreenText: copy,
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
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let activeCount = 0;
  let index = 0;

  return new Promise<void>((resolve, reject) => {
    if (items.length === 0) {
      resolve();
      return;
    }

    let settled = 0;

    function next() {
      while (activeCount < maxConcurrent && index < items.length) {
        const currentIndex = index++;
        activeCount++;

        fn(items[currentIndex])
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
