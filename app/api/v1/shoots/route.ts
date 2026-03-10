import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

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
