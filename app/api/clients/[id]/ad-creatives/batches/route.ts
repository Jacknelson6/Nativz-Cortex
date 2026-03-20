import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/ad-creatives/batches
 *
 * List generation batches for a client. Supports ?status= filter.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  const admin = createAdminClient();
  let query = admin
    .from('ad_generation_batches')
    .select('id, status, total_count, completed_count, failed_count, config, created_at, completed_at, placeholder_config')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (statusFilter) {
    // Support comma-separated statuses
    const statuses = statusFilter.split(',').map((s) => s.trim());
    query = query.in('status', statuses);
  }

  const { data: batches, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
  }

  return NextResponse.json({ batches: batches ?? [] });
}
