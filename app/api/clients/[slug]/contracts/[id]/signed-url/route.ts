import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contract } = await admin
    .from('client_contracts')
    .select('file_path, client_id, file_name')
    .eq('id', id)
    .single();
  if (!contract || contract.client_id !== client.id || !contract.file_path) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from('client-contracts')
    .createSignedUrl(contract.file_path, 60);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Sign failed' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, file_name: contract.file_name });
}
