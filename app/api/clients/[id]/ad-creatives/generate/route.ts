import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { runGenerationBatch } from '@/lib/ad-creatives/orchestrate-batch';
import { AD_GENERATE_MAX_PRODUCTS } from '@/lib/ad-creatives/types';

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
  count: z.number().int().min(1).max(10),
});

const creativeOverrideSchema = z.object({
  templateId: z.string().uuid(),
  variationIndex: z.number().int().min(0).max(25),
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
  // v2: per-template variation counts (preferred)
  templateVariations: z.array(templateVariationSchema).min(1).optional(),
  // v1 compat: flat templateIds + numVariations (deprecated, still accepted)
  templateIds: z.array(z.string().uuid()).optional(),
  numVariations: z.number().int().min(1).max(20).optional(),
  templateSource: z.enum(['kandy', 'custom']),
  productService: z.string().min(1, 'Product or service description is required').max(500),
  offer: z.string().max(300).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  manualText: manualTextSchema.optional(),
  products: z.array(productInfoSchema).max(AD_GENERATE_MAX_PRODUCTS).optional(),
  brandUrl: optionalBrandUrl,
  placeholderConfig: z.object({
    brandColors: z.array(z.string()).optional(),
    templateThumbnails: z.array(z.object({
      templateId: z.string(),
      imageUrl: z.string(),
      variationIndex: z.number(),
    })).optional(),
  }).optional(),
  /** Full set from prompt review — one per template × variation slot */
  creativeOverrides: z.array(creativeOverrideSchema).max(120).optional(),
}).refine(
  (data) => data.onScreenTextMode !== 'manual' || data.manualText !== undefined,
  { message: 'manualText is required when onScreenTextMode is "manual"', path: ['manualText'] },
).refine(
  (data) => (data.templateVariations && data.templateVariations.length > 0) || (data.templateIds && data.templateIds.length > 0),
  { message: 'Either templateVariations or templateIds is required', path: ['templateVariations'] },
).refine(
  (data) => {
    const co = data.creativeOverrides;
    if (!co?.length) return true;
    const resolved = data.templateVariations ?? (data.templateIds ?? []).map((id) => ({
      templateId: id,
      count: data.numVariations ?? 2,
    }));
    const expected = resolved.reduce((sum, tv) => sum + tv.count, 0);
    return co.length === expected;
  },
  { message: 'creativeOverrides must include exactly one entry per template variation', path: ['creativeOverrides'] },
);

/**
 * POST /api/clients/[id]/ad-creatives/generate
 *
 * Start an ad generation batch. Creates a batch record and processes in background.
 *
 * @auth Required (admin)
 * @body templateIds - Array of template UUIDs to use
 * @body templateSource - 'kandy' or 'custom'
 * @body productService - Product/service description for the ads
 * @body offer - Optional promotional offer text
 * @body aspectRatio - Output aspect ratio
 * @body numVariations - Number of variations per template (1-20)
 * @body products - Up to AD_GENERATE_MAX_PRODUCTS items
 * @body onScreenTextMode - 'ai_generate' or 'manual'
 * @body manualText - Required when onScreenTextMode is 'manual'
 * @returns {{ batchId: string, status: 'queued' }}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: AI endpoint
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

  // Verify client exists
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const {
    templateVariations,
    templateIds: legacyTemplateIds,
    templateSource,
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
  } = parsed.data;

  // Normalize to templateVariations format
  const resolvedVariations = templateVariations ?? (legacyTemplateIds ?? []).map((id) => ({
    templateId: id,
    count: legacyNumVariations ?? 2,
  }));

  const resolvedTemplateIds = resolvedVariations.map((v) => v.templateId);
  const totalCount = resolvedVariations.reduce((sum, v) => sum + v.count, 0);

  // Build config for storage
  const config = {
    aspectRatio,
    templateVariations: resolvedVariations,
    productService,
    offer: offer ?? '',
    onScreenText: onScreenTextMode === 'manual' ? manualText! : ('ai_generate' as const),
    templateIds: resolvedTemplateIds,
    templateSource,
    ...(products && { products }),
    ...(brandUrl && { brandUrl }),
    ...(creativeOverrides && creativeOverrides.length > 0 ? { creativeOverrides } : {}),
  };

  // Create batch record
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

  // Process in background
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
