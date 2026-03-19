import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { runGenerationBatch } from '@/lib/ad-creatives/orchestrate-batch';

export const maxDuration = 300;

const manualTextSchema = z.object({
  headline: z.string().min(1).max(200),
  subheadline: z.string().min(1).max(300),
  cta: z.string().min(1).max(100),
});

const bodySchema = z.object({
  templateIds: z.array(z.string().uuid()).min(1, 'At least one template is required'),
  templateSource: z.enum(['kandy', 'custom']),
  productService: z.string().min(1, 'Product or service description is required').max(500),
  offer: z.string().max(300).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  numVariations: z.number().int().min(1).max(20),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  manualText: manualTextSchema.optional(),
}).refine(
  (data) => data.onScreenTextMode !== 'manual' || data.manualText !== undefined,
  { message: 'manualText is required when onScreenTextMode is "manual"', path: ['manualText'] },
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

  const { templateIds, templateSource, productService, offer, aspectRatio, numVariations, onScreenTextMode, manualText } = parsed.data;
  const totalCount = templateIds.length * numVariations;

  // Build config for storage
  const config = {
    aspectRatio,
    numVariations,
    productService,
    offer: offer ?? '',
    onScreenText: onScreenTextMode === 'manual' ? manualText! : ('ai_generate' as const),
    templateIds,
    templateSource,
  };

  // Create batch record
  const { data: batch, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: clientId,
      status: 'pending',
      config,
      total_count: totalCount,
      completed_count: 0,
      failed_count: 0,
      created_by: user.id,
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
