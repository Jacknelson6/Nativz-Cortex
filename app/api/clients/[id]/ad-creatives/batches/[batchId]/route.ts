import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sortAdCreativesForBatch } from '@/lib/ad-creatives/sort-creatives';
import type { AdCreative } from '@/lib/ad-creatives/types';

/**
 * GET /api/clients/[id]/ad-creatives/batches/[batchId]
 *
 * Get batch status, progress counts, and list of completed creatives.
 *
 * @auth Required
 * @param id - Client UUID
 * @param batchId - Batch UUID
 * @returns {{ batch: AdGenerationBatch, creatives: AdCreative[] }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  try {
    const { id: clientId, batchId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    // Fetch the batch — ensure it belongs to the correct client
    const { data: batch, error: batchErr } = await admin
      .from('ad_generation_batches')
      .select('*')
      .eq('id', batchId)
      .eq('client_id', clientId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Fetch completed creatives for this batch
    const { data: creatives, error: creativesErr } = await admin
      .from('ad_creatives')
      .select('id, batch_id, client_id, template_id, template_source, image_url, aspect_ratio, on_screen_text, product_service, offer, is_favorite, metadata, created_at')
      .eq('batch_id', batchId);

    if (creativesErr) {
      console.error('Failed to fetch creatives for batch:', creativesErr);
      return NextResponse.json({ error: 'Failed to fetch creatives' }, { status: 500 });
    }

    const ordered = sortAdCreativesForBatch((creatives ?? []) as AdCreative[]);

    return NextResponse.json({
      batch,
      creatives: ordered,
    });
  } catch (error) {
    console.error('GET /api/clients/[id]/ad-creatives/batches/[batchId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
