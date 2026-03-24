import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { runGenerationBatch } from '@/lib/ad-creatives/orchestrate-batch';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import {
  assertBrandDnaGuidelineForAdGeneration,
  BrandDnaRequiredError,
} from '@/lib/ad-creatives/require-brand-dna-for-generation';
import { AD_GENERATE_MAX_PRODUCTS, BRAND_LAYOUT_MODES } from '@/lib/ad-creatives/types';
import { DEFAULT_BATCH_CTA } from '@/lib/ad-creatives/batch-cta-presets';
import { assertValidNanoBananaSlugs } from '@/lib/ad-creatives/nano-banana/catalog';
import { globalSlotOrderMatchesVariations } from '@/lib/ad-creatives/nano-banana/bulk-presets';

export const maxDuration = 300;

const manualTextSchema = z.object({
  headline: z.string().min(1).max(200),
  subheadline: z.string().min(1).max(300),
  cta: z.string().min(1).max(100),
});

/** Empty string / bad URL from scrapers → null so Zod does not reject the batch. */
const nullableImageUrl = z.preprocess((val) => {
  if (val === '' || val === undefined) return null;
  if (typeof val !== 'string') return null;
  try {
    const u = new URL(val);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return val;
  } catch {
    return null;
  }
}, z.union([z.string().url(), z.null()]));

const productInfoSchema = z.object({
  product: z.object({
    name: z.string().min(1).max(200),
    imageUrl: nullableImageUrl,
    /** Scraped catalog copy is often longer than 500 chars */
    description: z.string().max(8000),
  }),
  offer: z.string().max(300),
  cta: z.string().max(100),
});

const templateVariationSchema = z.object({
  templateId: z.string().uuid(),
  count: z.number().int().min(1).max(200),
});

const globalTemplateVariationSchema = z.object({
  slug: z.string().min(1).max(80),
  count: z.number().int().min(1).max(200),
});

/** UUID client template or global Nano Banana slug */
const creativeOverrideSchema = z.object({
  templateId: z.string().min(1).max(80),
  variationIndex: z.number().int().min(0).max(199),
  headline: z.string().min(1).max(200),
  subheadline: z.string().min(1).max(300),
  cta: z.string().min(1).max(100),
  styleNotes: z.string().max(4000).optional(),
});

const optionalBrandUrl = z.preprocess((val) => {
  if (val === '' || val === undefined || val === null) return undefined;
  return val;
}, z.string().url().optional());

const bodySchema = z.object({
  templateVariations: z.array(templateVariationSchema).min(1).optional(),
  templateIds: z.array(z.string().uuid()).optional(),
  numVariations: z.number().int().min(1).max(20).optional(),
  globalTemplateVariations: z.array(globalTemplateVariationSchema).min(1).optional(),
  globalTemplateSlotOrder: z.array(z.string().min(1).max(80)).max(200).optional(),
  rotateProductImageUrls: z.boolean().optional(),
  productImageUrls: z.array(z.string().url()).max(12).optional(),
  productService: z.string().min(1, 'Product or service description is required').max(500),
  offer: z.string().max(300).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  batchCta: z.string().min(1).max(30).optional(),
  manualText: manualTextSchema.optional(),
  products: z.array(productInfoSchema).max(AD_GENERATE_MAX_PRODUCTS).optional(),
  brandUrl: optionalBrandUrl,
  placeholderConfig: z.object({
    brandColors: z.array(z.string()).optional(),
    skeletonOnly: z.boolean().optional(),
    templateThumbnails: z.array(z.object({
      templateId: z.string(),
      imageUrl: z.string(),
      variationIndex: z.number(),
    })).optional(),
  }).optional(),
  creativeOverrides: z.array(creativeOverrideSchema).max(200).optional(),
  styleDirectionGlobal: z.string().max(4000).optional(),
  brandLayoutMode: z.enum(BRAND_LAYOUT_MODES).optional(),
  creativeBrief: z.string().max(4000).optional(),
}).refine(
  (data) => data.onScreenTextMode !== 'manual' || data.manualText !== undefined,
  { message: 'manualText is required when onScreenTextMode is "manual"', path: ['manualText'] },
).refine(
  (data) => {
    const hasGlobal = (data.globalTemplateVariations?.length ?? 0) > 0;
    const hasClient =
      (data.templateVariations?.length ?? 0) > 0 || (data.templateIds?.length ?? 0) > 0;
    return (hasGlobal && !hasClient) || (!hasGlobal && hasClient);
  },
  {
    message: 'Use either globalTemplateVariations (Nano Banana) or client templateVariations/templateIds, not both',
    path: ['globalTemplateVariations'],
  },
).refine(
  (data) => {
    const co = data.creativeOverrides;
    if (!co?.length) return true;
    const hasGlobal = (data.globalTemplateVariations?.length ?? 0) > 0;
    const resolved = hasGlobal
      ? (data.globalTemplateVariations ?? [])
      : (data.templateVariations ?? (data.templateIds ?? []).map((id) => ({
          templateId: id,
          count: data.numVariations ?? 2,
        })));
    const expected =
      hasGlobal && data.globalTemplateSlotOrder?.length
        ? data.globalTemplateSlotOrder.length
        : resolved.reduce((sum, tv) => sum + tv.count, 0);
    return co.length === expected;
  },
  { message: 'creativeOverrides must include exactly one entry per template variation', path: ['creativeOverrides'] },
).refine(
  (data) => {
    const so = data.globalTemplateSlotOrder;
    const gtv = data.globalTemplateVariations;
    if (!so?.length) return true;
    if (!gtv?.length) return false;
    return globalSlotOrderMatchesVariations(so, gtv);
  },
  {
    message: 'globalTemplateSlotOrder slug counts must match globalTemplateVariations',
    path: ['globalTemplateSlotOrder'],
  },
);

/**
 * POST /api/clients/[id]/ad-creatives/generate
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimitByUser(user.id, '/api/clients/ad-creatives/generate', 'ai');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  try {
    const brandContext = await getBrandContext(clientId, { bypassCache: true });
    assertBrandDnaGuidelineForAdGeneration(brandContext);
  } catch (e) {
    if (e instanceof BrandDnaRequiredError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('Load brand context for ad generation:', e);
    return NextResponse.json({ error: 'Could not load brand context for this client' }, { status: 500 });
  }

  const {
    templateVariations,
    templateIds: legacyTemplateIds,
    globalTemplateVariations,
    globalTemplateSlotOrder,
    rotateProductImageUrls,
    productImageUrls,
    productService,
    offer,
    aspectRatio,
    numVariations: legacyNumVariations,
    onScreenTextMode,
    manualText,
    products,
    brandUrl,
    placeholderConfig,
    creativeOverrides,
    styleDirectionGlobal,
    batchCta,
    brandLayoutMode,
    creativeBrief,
  } = parsed.data;

  const isNano = (globalTemplateVariations?.length ?? 0) > 0;

  let totalCount: number;
  let config: Record<string, unknown>;

  if (isNano) {
    const gtv = globalTemplateVariations!;
    const slugSet = [...new Set(gtv.map((g) => g.slug))];
    try {
      assertValidNanoBananaSlugs(slugSet);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid Nano Banana slug';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (globalTemplateSlotOrder?.length) {
      try {
        assertValidNanoBananaSlugs(globalTemplateSlotOrder);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid Nano Banana slug';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    totalCount = globalTemplateSlotOrder?.length ?? gtv.reduce((sum, g) => sum + g.count, 0);
    const resolvedBatchCta =
      onScreenTextMode === 'ai_generate'
        ? (batchCta?.trim() || DEFAULT_BATCH_CTA).slice(0, 30)
        : undefined;

    config = {
      aspectRatio,
      globalTemplateVariations: gtv,
      templateIds: [],
      productService,
      offer: offer ?? '',
      onScreenText: onScreenTextMode === 'manual' ? manualText! : ('ai_generate' as const),
      ...(resolvedBatchCta ? { batchCta: resolvedBatchCta } : {}),
      brandLayoutMode: 'schema_only',
      ...(creativeBrief?.trim() ? { creativeBrief: creativeBrief.trim() } : {}),
      ...(products && { products }),
      ...(brandUrl && { brandUrl }),
      ...(creativeOverrides && creativeOverrides.length > 0 ? { creativeOverrides } : {}),
      ...(styleDirectionGlobal?.trim() ? { styleDirectionGlobal: styleDirectionGlobal.trim() } : {}),
      ...(productImageUrls && productImageUrls.length > 0 ? { productImageUrls } : {}),
      ...(globalTemplateSlotOrder && globalTemplateSlotOrder.length > 0
        ? { globalTemplateSlotOrder }
        : {}),
      ...(rotateProductImageUrls === true ? { rotateProductImageUrls: true } : {}),
    };
  } else {
    const resolvedVariations = templateVariations ?? (legacyTemplateIds ?? []).map((id) => ({
      templateId: id,
      count: legacyNumVariations ?? 2,
    }));

    const resolvedTemplateIds = resolvedVariations.map((v) => v.templateId);
    totalCount = resolvedVariations.reduce((sum, v) => sum + v.count, 0);

    const { data: ownedRows, error: ownedErr } = await admin
      .from('ad_prompt_templates')
      .select('id')
      .eq('client_id', clientId)
      .in('id', resolvedTemplateIds);

    if (ownedErr) {
      console.error('ad_prompt_templates validation failed:', ownedErr);
      return NextResponse.json({ error: 'Failed to validate templates' }, { status: 500 });
    }

    const ownedIds = new Set((ownedRows ?? []).map((r) => r.id));
    for (const id of resolvedTemplateIds) {
      if (!ownedIds.has(id)) {
        return NextResponse.json(
          { error: 'One or more templates were not found for this client.' },
          { status: 400 },
        );
      }
    }

    const resolvedBatchCta =
      onScreenTextMode === 'ai_generate'
        ? (batchCta?.trim() || DEFAULT_BATCH_CTA).slice(0, 30)
        : undefined;

    config = {
      aspectRatio,
      templateVariations: resolvedVariations,
      productService,
      offer: offer ?? '',
      onScreenText: onScreenTextMode === 'manual' ? manualText! : ('ai_generate' as const),
      ...(resolvedBatchCta ? { batchCta: resolvedBatchCta } : {}),
      templateIds: resolvedTemplateIds,
      brandLayoutMode: brandLayoutMode ?? 'reference_image',
      ...(creativeBrief?.trim() ? { creativeBrief: creativeBrief.trim() } : {}),
      ...(products && { products }),
      ...(brandUrl && { brandUrl }),
      ...(creativeOverrides && creativeOverrides.length > 0 ? { creativeOverrides } : {}),
      ...(styleDirectionGlobal?.trim() ? { styleDirectionGlobal: styleDirectionGlobal.trim() } : {}),
      ...(productImageUrls && productImageUrls.length > 0 ? { productImageUrls } : {}),
      ...(rotateProductImageUrls === true ? { rotateProductImageUrls: true } : {}),
    };
  }

  const { data: batch, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: clientId,
      status: 'queued',
      config,
      total_count: totalCount,
      completed_count: 0,
      failed_count: 0,
      created_by: user.id,
      placeholder_config: placeholderConfig ?? null,
    })
    .select('id')
    .single();

  if (batchErr || !batch) {
    console.error('Failed to create batch:', batchErr);
    return NextResponse.json({ error: 'Failed to create generation batch' }, { status: 500 });
  }

  after(async () => {
    try {
      await runGenerationBatch(batch.id);
    } catch (err) {
      console.error('Background batch generation failed:', err);
      await admin
        .from('ad_generation_batches')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id);
    }
  });

  return NextResponse.json({ batchId: batch.id, status: 'queued' });
}
