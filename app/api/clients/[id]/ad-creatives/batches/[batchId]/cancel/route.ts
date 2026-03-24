import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const ACTIVE = new Set(['queued', 'generating']);

/**
 * POST /api/clients/[id]/ad-creatives/batches/[batchId]/cancel
 *
 * Stops scheduling further images for this batch. Work already running (e.g. Gemini) may still finish.
 *
 * @auth Required (signed-in admin / app user)
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  try {
    const { id: clientId, batchId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: batch, error: batchErr } = await admin
      .from('ad_generation_batches')
      .select('id, status')
      .eq('id', batchId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const status = (batch as { status: string }).status;
    if (!ACTIVE.has(status)) {
      return NextResponse.json(
        { error: 'This batch is not running', status },
        { status: 409 },
      );
    }

    const { error: updateErr } = await admin
      .from('ad_generation_batches')
      .update({ status: 'cancelled' })
      .eq('id', batchId)
      .eq('client_id', clientId);

    if (updateErr) {
      console.error('[cancel batch]', updateErr);
      return NextResponse.json({ error: 'Could not cancel batch' }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: 'cancelled' });
  } catch (e) {
    console.error('POST cancel batch:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
