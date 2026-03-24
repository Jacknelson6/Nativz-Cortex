import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND_DNA_JOB_STALE_MS, isBrandDnaJobInFlightStatus } from '@/lib/brand-dna/constants';

/**
 * GET /api/clients/[id]/brand-dna/status
 *
 * Poll the latest Brand DNA generation job status for a client.
 *
 * @auth Required
 * @returns {{ status, progress_pct, step_label, error_message, is_stale?, stale_hint? }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('brand_dna_jobs')
    .select(
      'id, status, progress_pct, step_label, error_message, pages_crawled, completed_at, created_at, updated_at',
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ status: 'none', progress_pct: 0, step_label: null, is_stale: false });
  }

  let isStale = false;
  let staleHint: string | null = null;
  if (isBrandDnaJobInFlightStatus(job.status)) {
    const touchIso =
      typeof job.updated_at === 'string' && job.updated_at.length > 0
        ? job.updated_at
        : (typeof job.created_at === 'string' ? job.created_at : null);
    const touchMs = touchIso ? new Date(touchIso).getTime() : 0;
    if (touchMs > 0 && Date.now() - touchMs >= BRAND_DNA_JOB_STALE_MS) {
      isStale = true;
      staleHint =
        'This run has not updated in a while. It may have stalled (e.g. model timeout or serverless limit). You can reset and try again.';
    }
  }

  return NextResponse.json({
    ...job,
    is_stale: isStale,
    stale_hint: staleHint,
  });
}
