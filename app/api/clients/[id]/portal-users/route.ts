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

    // Get client's organization_id
    const { data: client } = await adminClient
      .from('clients')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (!client?.organization_id) {
      return NextResponse.json({ error: 'Client not found or missing organization' }, { status: 404 });
    }

    // Get all viewer users in this org
    const { data: portalUsers, error } = await adminClient
      .from('users')
      .select('id, email, full_name, avatar_url, last_login, created_at, is_active')
      .eq('organization_id', client.organization_id)
      .eq('role', 'viewer')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch portal users:', error);
      return NextResponse.json({ error: 'Failed to fetch portal users' }, { status: 500 });
    }

    return NextResponse.json({ users: portalUsers ?? [] });
  } catch (error) {
    console.error('GET /api/clients/[id]/portal-users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
