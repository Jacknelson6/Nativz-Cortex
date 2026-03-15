import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/shoots
 *
 * List shoot events, optionally filtered by client, status, and date range.
 * Returns shoots ordered by shoot_date ascending, with client name and slug.
 *
 * @auth API key (Bearer token via Authorization header)
 * @query client_id - Filter by client UUID (optional)
 * @query status - Filter by scheduled_status (optional)
 * @query date_from - ISO date lower bound inclusive (optional)
 * @query date_to - ISO date upper bound inclusive (optional)
 * @returns {{ shoots: ShootEvent[] }}
 */
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);

  let query = admin
    .from('shoot_events')
    .select('*, clients(id, name, slug)')
    .order('shoot_date', { ascending: true });

  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('scheduled_status', status);
  if (dateFrom) query = query.gte('shoot_date', dateFrom);
  if (dateTo) query = query.lte('shoot_date', dateTo);

  const { data: shoots, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch shoots' }, { status: 500 });
  }

  return NextResponse.json({ shoots: shoots ?? [] });
}
