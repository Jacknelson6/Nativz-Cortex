import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

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

  // Effective-access check — honors admin impersonation.
  const ctx = await getEffectiveAccessContext(user, admin);
  if (ctx.role === 'viewer' && data.client_id) {
    const artifactClientId = data.client_id as string;
    const inScope = (ctx.clientIds && ctx.clientIds.includes(artifactClientId)) || false;
    if (!inScope) {
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

  // Admin-only deletes. Impersonating admins fall to viewer and are
  // refused — exit impersonation to wield admin mutations.
  const ctx = await getEffectiveAccessContext(user, admin);
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { error } = await admin.from('nerd_artifacts').delete().eq('id', id);
  if (error) {
    console.error('Error deleting artifact:', error);
    return NextResponse.json({ error: 'Failed to delete artifact' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
