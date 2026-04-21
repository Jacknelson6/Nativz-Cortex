import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Delete a single ad asset. Removes the storage object first, then the
 * row. Order matters — if the DB delete fails we'd rather leave a
 * dangling row than a dangling file (storage is where the bytes live,
 * and admins can always re-delete the row from the UI).
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
  if (!id || id.length < 10) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { data: asset } = await admin
    .from('ad_assets')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Best-effort storage removal. If the object is already gone we still
  // want to drop the row so the UI unblocks.
  await admin.storage.from('ad-assets').remove([asset.storage_path]);

  const { error } = await admin.from('ad_assets').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
