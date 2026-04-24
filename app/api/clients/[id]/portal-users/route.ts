/**
 * GET /api/clients/[id]/portal-users
 *
 * List all portal users (role='viewer') for a client's organization.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @returns {{ users: PortalUser[] }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Scope by user_client_access — the row that actually maps a portal
    // user to a specific client. Filtering by organization_id was too wide:
    // orgs own many clients (e.g. a Nativz account can house Rank Prompt +
    // Weston Funding + Owings Auto etc.), so the old query returned every
    // portal user in the whole org under each client's Portal users list.
    // `user_client_access!inner` forces an inner join so users with zero
    // rows for this client are excluded.
    const { data: portalUsers, error } = await adminClient
      .from('users')
      .select(
        'id, email, full_name, avatar_url, last_login, created_at, is_active, user_client_access!inner(client_id)',
      )
      .eq('role', 'viewer')
      .eq('user_client_access.client_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch portal users:', error);
      return NextResponse.json({ error: 'Failed to fetch portal users' }, { status: 500 });
    }

    // Strip the join artifact before returning so the shape stays identical
    // to what the frontend already expects.
    const shaped = (portalUsers ?? []).map(({ user_client_access: _uca, ...rest }) => rest);

    return NextResponse.json({ users: shaped });
  } catch (error) {
    console.error('GET /api/clients/[id]/portal-users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
