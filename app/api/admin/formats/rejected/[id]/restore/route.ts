// VFF-04 T11: POST /api/admin/formats/rejected/[id]/restore
// Re-enters a rejected viral_video into the gate queue.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const allowed =
    me &&
    (ADMIN_ROLES.includes((me as { role: string }).role) ||
      (me as { is_super_admin?: boolean }).is_super_admin);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: row } = await admin
    .from('viral_videos')
    .select('id, analysis_status')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const status = (row as { analysis_status: string }).analysis_status;
  if (status !== 'rejected' && status !== 'failed') {
    if (status === 'analyzed') {
      return NextResponse.json(
        { error: 'Already analyzed' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Not rejected' }, { status: 404 });
  }

  const { error } = await admin
    .from('viral_videos')
    .update({
      analysis_status: 'pending',
      reject_reason: null,
      gate_metadata: {},
      gated_at: null,
    })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id, analysis_status: 'pending' });
}
