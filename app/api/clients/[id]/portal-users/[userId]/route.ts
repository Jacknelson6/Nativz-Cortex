/**
 * PATCH /api/clients/[id]/portal-users/[userId]  — Toggle active status
 * DELETE /api/clients/[id]/portal-users/[userId]  — Remove portal access for this client
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @param userId - User UUID
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id, userId } = await params;

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

    const body = await request.json();
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active (boolean) is required' }, { status: 400 });
    }

    // Verify user belongs to this client's org
    const { data: client } = await adminClient
      .from('clients')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (!client?.organization_id) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { data: targetUser } = await adminClient
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (targetUser?.organization_id !== client.organization_id) {
      return NextResponse.json({ error: 'User does not belong to this client' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('users')
      .update({ is_active: body.is_active })
      .eq('id', userId);

    if (error) {
      console.error('Failed to update portal user:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/clients/[id]/portal-users/[userId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id: clientId, userId } = await params;

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

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Remove user_client_access row for this client
    const { error: accessError } = await adminClient
      .from('user_client_access')
      .delete()
      .eq('user_id', userId)
      .eq('client_id', clientId);

    if (accessError) {
      console.error('Failed to remove user_client_access:', accessError);
      return NextResponse.json({ error: 'Failed to remove portal access' }, { status: 500 });
    }

    // Check if user still has access to any other clients
    const { data: remainingAccess } = await adminClient
      .from('user_client_access')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    // If no remaining access, deactivate the user
    if (!remainingAccess?.length) {
      await adminClient
        .from('users')
        .update({ is_active: false })
        .eq('id', userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/portal-users/[userId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
