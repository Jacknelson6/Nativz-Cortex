import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('id, role, is_super_admin, organization_id')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin;

  const searchParams = req.nextUrl.searchParams;
  const clientId = searchParams.get('client_id');
  const subscriptionId = searchParams.get('subscription_id');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  let query = admin
    .from('competitor_reports')
    .select(
      'id, subscription_id, client_id, organization_id, generated_at, period_start, period_end, pdf_storage_path, email_resend_id, email_status, email_error, client:clients(name, agency)',
    )
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);
  if (subscriptionId) query = query.eq('subscription_id', subscriptionId);
  if (!isAdmin) {
    if (!me?.organization_id) return NextResponse.json({ reports: [] });
    query = query.eq('organization_id', me.organization_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reports: data ?? [] });
}
