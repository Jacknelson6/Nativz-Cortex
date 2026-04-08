import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const admin = createAdminClient();
  const { data } = await admin.from('users').select('is_super_admin').eq('id', user.id).single();
  if (!data?.is_super_admin) return { error: 'Forbidden', status: 403 };
  return { error: null, status: 200 };
}

/** GET /api/admin/users — all users with enriched data (super_admin only) */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  // Fetch all data in parallel
  const [usersRes, clientAccessRes, searchCountRes, authRes] = await Promise.all([
    admin.from('users').select('id, email, full_name, role, is_super_admin, organization_id, avatar_url, created_at').order('role').order('full_name'),
    admin.from('user_client_access').select('user_id, client_id, clients(name)'),
    admin.from('topic_searches').select('created_by').not('created_by', 'is', null),
    admin.auth.admin.listUsers({ perPage: 500 }),
  ]);

  const users = usersRes.data ?? [];
  const clientAccess = clientAccessRes.data ?? [];
  const searchRows = searchCountRes.data ?? [];

  // Build auth lookup
  const authByUser: Record<string, { last_sign_in_at: string | null; created_at: string }> = {};
  for (const au of authRes.data?.users ?? []) {
    authByUser[au.id] = {
      last_sign_in_at: au.last_sign_in_at ?? null,
      created_at: au.created_at,
    };
  }

  // Build search counts
  const searchCounts: Record<string, number> = {};
  for (const s of searchRows) {
    if (s.created_by) searchCounts[s.created_by] = (searchCounts[s.created_by] ?? 0) + 1;
  }

  // Build client access map
  const clientsByUser: Record<string, string[]> = {};
  for (const ca of clientAccess) {
    const clientName = Array.isArray(ca.clients) ? ca.clients[0]?.name : (ca.clients as { name: string } | null)?.name;
    if (clientName) {
      const list = clientsByUser[ca.user_id] ?? [];
      list.push(clientName);
      clientsByUser[ca.user_id] = list;
    }
  }

  const enriched = users.map((u) => ({
    ...u,
    last_sign_in_at: authByUser[u.id]?.last_sign_in_at ?? null,
    auth_created_at: authByUser[u.id]?.created_at ?? u.created_at,
    search_count: searchCounts[u.id] ?? 0,
    client_access: clientsByUser[u.id] ?? [],
  }));

  return NextResponse.json({ users: enriched });
}

/** PATCH /api/admin/users — update user role/permissions */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, role, is_super_admin } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (is_super_admin !== undefined) updates.is_super_admin = is_super_admin;

  const { error } = await admin.from('users').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: true });
}

/** DELETE /api/admin/users — delete a user (removes auth + public.users) */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();

  // Delete from auth (cascades to public.users via trigger in most setups)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    // Fallback: delete from public.users if auth delete fails
    await admin.from('users').delete().eq('id', id);
  }

  // Also clean up user_client_access
  await admin.from('user_client_access').delete().eq('user_id', id);

  return NextResponse.json({ deleted: true });
}
