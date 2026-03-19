/**
 * DELETE /api/team/[id]/delete-account
 *
 * Delete a team member's Supabase auth account and users record.
 * Unlinks the team_member but does NOT delete the team_member record itself.
 *
 * @auth Required (super admin)
 * @param id - Team member UUID
 * @returns {{ success: true }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
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

    // Require super admin
    const { data: currentUser } = await adminClient
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (currentUser?.role !== 'admin' || !currentUser?.is_super_admin) {
      return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
    }

    // Get team member's linked user_id
    const { data: member } = await adminClient
      .from('team_members')
      .select('user_id, full_name')
      .eq('id', id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (!member.user_id) {
      return NextResponse.json({ error: 'Team member has no linked account' }, { status: 400 });
    }

    // Prevent self-deletion
    if (member.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Delete users table record
    await adminClient
      .from('users')
      .delete()
      .eq('id', member.user_id);

    // Delete Supabase auth user
    const { error: authError } = await adminClient.auth.admin.deleteUser(member.user_id);
    if (authError) {
      console.error('Failed to delete auth user:', authError);
      // Non-fatal — users record already deleted
    }

    // Unlink team member
    await adminClient
      .from('team_members')
      .update({ user_id: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/team/[id]/delete-account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
