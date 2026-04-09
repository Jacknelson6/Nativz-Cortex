import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET /api/admin/errors — recent API errors (super_admin only) */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('is_super_admin').eq('id', user.id).single();
  if (!me?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const days = Number(req.nextUrl.searchParams.get('days') ?? '7');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);

  const { data: errors } = await admin
    .from('api_error_log')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  // Also get error counts by route
  const { data: summary } = await admin
    .from('api_error_log')
    .select('route, status_code')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString());

  const byRoute: Record<string, number> = {};
  for (const e of summary ?? []) {
    byRoute[e.route] = (byRoute[e.route] ?? 0) + 1;
  }

  return NextResponse.json({
    errors: errors ?? [],
    summary: byRoute,
    total: (summary ?? []).length,
  });
}
