import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET — fetch a single artifact by ID */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('nerd_artifacts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  // Scope check for portal users
  const { data: userData } = await admin.from('users').select('role, organization_id').eq('id', user.id).single();
  if (userData?.role === 'viewer' && userData.organization_id && data.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('organization_id')
      .eq('id', data.client_id)
      .single();
    if (client?.organization_id !== userData.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return NextResponse.json(data);
}

/** DELETE — remove an artifact */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Verify admin
  const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { error } = await admin.from('nerd_artifacts').delete().eq('id', id);
  if (error) {
    console.error('Error deleting artifact:', error);
    return NextResponse.json({ error: 'Failed to delete artifact' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
