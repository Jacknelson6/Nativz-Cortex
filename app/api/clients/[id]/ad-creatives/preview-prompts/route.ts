import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assembleImagePrompt } from '@/lib/ad-creatives/assemble-prompt';
import { generateAdCopy } from '@/lib/ad-creatives/generate-copy';
import { generateCreativeBrief } from '@/lib/ad-creatives/generate-creative-brief';
import type { AdCreativeTemplate, AdPromptTemplate } from '@/lib/ad-creatives/types';
import { BRAND_LAYOUT_MODES } from '@/lib/ad-creatives/types';
import { adPromptRowToWizardTemplate } from '@/lib/ad-creatives/wizard-template';
import { DEFAULT_BATCH_CTA } from '@/lib/ad-creatives/batch-cta-presets';
import { buildNanoBananaImagePrompt } from '@/lib/ad-creatives/nano-banana/build-nano-prompt';
import { fillNanoBananaTemplate } from '@/lib/ad-creatives/nano-banana/fill-template';
import { getNanoBananaBySlug } from '@/lib/ad-creatives/nano-banana/catalog';
import { getClientAdGenerationSettings } from '@/lib/ad-creatives/client-ad-generation-settings';

const bodySchema = z.object({
  templateVariations: z.array(z.object({
    templateId: z.string().uuid(),
    count: z.number().int().min(1).max(10),
  })).min(1).optional(),
  globalTemplateVariations: z.array(z.object({
    slug: z.string().min(1).max(80),
    count: z.number().int().min(1).max(10),
  })).min(1).optional(),
  productService: z.string().min(1).max(500),
  offer: z.string().max(300).optional(),
  batchCta: z.string().min(1).max(30).optional(),
  /** Same field as POST generate — merged into prompts so preview matches batch output. */
  styleDirectionGlobal: z.string().max(4000).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  manualText: z.object({
    headline: z.string(),
    subheadline: z.string(),
    cta: z.string(),
  }).optional(),
  brandLayoutMode: z.enum(BRAND_LAYOUT_MODES).optional(),
  creativeBrief: z.string().max(4000).optional(),
}).refine(
  (data) => {
    const hasGlobal = (data.globalTemplateVariations?.length ?? 0) > 0;
    const hasClient = (data.templateVariations?.length ?? 0) > 0;
    return (hasGlobal && !hasClient) || (!hasGlobal && hasClient);
  },
  {
    message: 'Use either globalTemplateVariations or templateVariations',
    path: ['globalTemplateVariations'],
  },
);

export interface PromptPreview {
  templateId: string;
  templateName: string;
  templateImageUrl: string;
  variationIndex: number;
  copy: { headline: string; subheadline: string; cta: string };
  prompt: string;
  styleNotes: string;
}

/**
 * POST /api/clients/[id]/ad-creatives/preview-prompts
 *
 * Generate prompts and copy without actually generating images.
 * Returns an array of prompt previews that can be edited before generation.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    templateVariations,
    globalTemplateVariations,
    productService,
    offer,
    batchCta,
    styleDirectionGlobal,
    aspectRatio,
    onScreenTextMode,
    manualText,
    brandLayoutMode,
    creativeBrief: creativeBriefInput,
  } = parsed.data;

  const isNano = (globalTemplateVariations?.length ?? 0) > 0;
  const layoutMode = isNano ? 'schema_only' : (brandLayoutMode ?? 'reference_image');
  const admin = createAdminClient();

  try {
    const brandContext = await getBrandContext(clientId);

    let maxCount: number;
    if (isNano) {
      maxCount = Math.max(...(globalTemplateVariations ?? []).map((tv) => tv.count));
    } else {
      const tv = templateVariations ?? [];
      maxCount = Math.max(...tv.map((t) => t.count));
    }
    let copyVariations: { headline: string; subheadline: string; cta: string }[];

    if (onScreenTextMode === 'ai_generate') {
      const resolvedBatchCta = (batchCta?.trim() || DEFAULT_BATCH_CTA).slice(0, 30);
      copyVariations = await generateAdCopy({
        brandContext,
        productService,
        offer: offer ?? null,
        count: maxCount,
        fixedCta: resolvedBatchCta,
      });
    } else {
      const text = manualText ?? { headline: '', subheadline: '', cta: '' };
      copyVariations = Array.from({ length: maxCount }, () => text);
    }

    let briefForPreviews = creativeBriefInput?.trim() ?? '';
    if (!briefForPreviews) {
      briefForPreviews = (
        await generateCreativeBrief({
          brandContext,
          productService,
          offer: offer ?? null,
        })
      ).trim();
    }

    const previews: PromptPreview[] = [];

    if (isNano) {
      const adGenSettings = await getClientAdGenerationSettings(clientId);
      for (const tv of globalTemplateVariations ?? []) {
        const entry = getNanoBananaBySlug(tv.slug);
        if (!entry) {
          return NextResponse.json({ error: `Unknown Nano Banana slug: ${tv.slug}` }, { status: 400 });
        }
        for (let i = 0; i < tv.count; i++) {
          const copy = copyVariations[i % copyVariations.length];
          const sd = styleDirectionGlobal?.trim() || undefined;
          const filled = fillNanoBananaTemplate(entry.promptTemplate, {
            onScreenText: copy,
            productService,
            offer: offer ?? '',
          });
          const prompt = buildNanoBananaImagePrompt({
            imagePromptModifier: adGenSettings.image_prompt_modifier,
            brandContext,
            filledTemplateBody: filled,
            aspectRatio,
            productService,
            offer: offer ?? null,
            creativeBrief: briefForPreviews || undefined,
            styleDirection: sd,
          });
          previews.push({
            templateId: tv.slug,
            templateName: entry.name,
            templateImageUrl: entry.previewPublicPath,
            variationIndex: i,
            copy,
            prompt,
            styleNotes: extractStyleNotes(prompt),
          });
        }
      }
    } else {
      const templateVariationsResolved = templateVariations ?? [];
      const uniqueTemplateIds = [...new Set(templateVariationsResolved.map((t) => t.templateId))];

      const { data: promptRows, error: tplErr } = await admin
        .from('ad_prompt_templates')
        .select('*')
        .eq('client_id', clientId)
        .in('id', uniqueTemplateIds);

      if (tplErr) {
        console.error('[preview-prompts] template query failed:', tplErr);
        return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
      }

      const templates: AdCreativeTemplate[] = (promptRows ?? []).map((row) =>
        adPromptRowToWizardTemplate(row as AdPromptTemplate),
      );

      if (templates.length !== uniqueTemplateIds.length) {
        return NextResponse.json(
          { error: 'One or more templates were not found for this client.' },
          { status: 400 },
        );
      }

      if (templates.length === 0) {
        return NextResponse.json({ error: 'No templates found' }, { status: 404 });
      }

      for (const tv of templateVariationsResolved) {
        const template = templates.find((t) => t.id === tv.templateId);
        if (!template) continue;

        for (let i = 0; i < tv.count; i++) {
          const copy = copyVariations[i % copyVariations.length];
          const sd = styleDirectionGlobal?.trim() || undefined;

          const prompt = assembleImagePrompt({
            brandContext,
            promptSchema: template.prompt_schema,
            productService,
            offer: offer ?? null,
            onScreenText: copy,
            aspectRatio,
            styleDirection: sd,
            creativeBrief: briefForPreviews || undefined,
          });

          previews.push({
            templateId: tv.templateId,
            templateName: template.collection_name ?? 'Template',
            templateImageUrl: template.image_url ?? '',
            variationIndex: i,
            copy,
            prompt,
            styleNotes: extractStyleNotes(prompt),
          });
        }
      }
    }

    return NextResponse.json({
      previews,
      creativeBrief: briefForPreviews || undefined,
      brandLayoutMode: layoutMode,
      imagePipeline: 'gemini_native',
    });
  } catch (err) {
    console.error('[preview-prompts] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate previews' },
      { status: 500 },
    );
  }
}

function extractStyleNotes(prompt: string): string {
  const lines = prompt.split('\n').filter((l) => l.trim());
  const styleLines = lines.filter((l) =>
    /style|color|font|layout|composition|tone|mood/i.test(l),
  );
  return styleLines.slice(0, 5).join('\n') || 'Standard brand style';
}
