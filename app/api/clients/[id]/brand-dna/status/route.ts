import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/brand-dna/status
 *
 * Poll the latest Brand DNA generation job status for a client.
 *
 * @auth Required
 * @returns {{ status, progress_pct, step_label, error_message }}
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
    .select('id, status, progress_pct, step_label, error_message, pages_crawled, completed_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ status: 'none', progress_pct: 0, step_label: null });
  }

  return NextResponse.json(job);
}
