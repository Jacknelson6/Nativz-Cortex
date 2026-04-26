import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

/** GET /api/brand-audits/[id] — read a single audit row. Used by the detail
 *  page and by the "still running" poll once we move execution off-thread. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: me } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!me || (!ADMIN_ROLES.includes(me.role) && !me.is_super_admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await adminClient
    .from('brand_audits')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  return NextResponse.json({ audit: data });
}
