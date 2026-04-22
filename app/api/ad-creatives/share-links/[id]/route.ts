import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Revoke a share token. Sets revoked_at rather than deleting so we keep
 * the audit trail ("who shared what, when, when revoked") without
 * orphaning any comments that arrived through the link.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await admin
    .from('ad_concept_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, revoked_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
