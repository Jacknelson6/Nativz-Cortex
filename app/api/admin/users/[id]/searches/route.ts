/**
 * GET /api/admin/users/[id]/searches
 *
 * Recent topic searches made by a specific user. Used by the user detail
 * card on /admin/users to show history at a glance.
 *
 * @auth Required (super_admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('is_super_admin').eq('id', user.id).single();
  if (!me?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await admin
    .from('topic_searches')
    .select('id, query, status, created_at, client_id, clients(name)')
    .eq('created_by', id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const searches = (data ?? []).map((s) => {
    const clientName = Array.isArray(s.clients)
      ? s.clients[0]?.name ?? null
      : (s.clients as { name: string } | null)?.name ?? null;
    return {
      id: s.id,
      query: s.query,
      status: s.status,
      created_at: s.created_at,
      client_name: clientName,
    };
  });

  return NextResponse.json({ searches });
}
