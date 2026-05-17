import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin' || data?.role === 'super_admin';
}

async function resolveClient(slugOrId: string) {
  const admin = createAdminClient();
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq(column, slugOrId)
    .single();
  return data;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const admin = createAdminClient();

  const { data: asset } = await admin
    .from('client_brand_assets')
    .select('id, storage_path')
    .eq('id', assetId)
    .eq('client_id', client.id)
    .maybeSingle();

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  await admin.storage.from('brand-assets').remove([asset.storage_path]);

  const { error: deleteErr } = await admin
    .from('client_brand_assets')
    .delete()
    .eq('id', asset.id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
