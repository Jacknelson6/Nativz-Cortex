import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';

const updateTeamMemberSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
  alias_emails: z.array(z.string().email()).optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') return null;
  return user;
}

/**
 * PATCH /api/team/[id]
 *
 * Update a team member's profile fields. At least one field must be provided.
 *
 * @auth Required (admin)
 * @param id - Team member UUID
 * @body full_name - Updated full name
 * @body email - Updated email address
 * @body role - Updated job role/title
 * @body avatar_url - Updated avatar URL
 * @body is_active - Updated active status
 * @returns {TeamMember} Updated team member record
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = updateTeamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('team_members')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating team member:', error);
      return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Audit log: team member update (especially role/active status changes)
    logActivity(user.id, 'team_member_updated', 'user', id, {
      updated_fields: Object.keys(updates),
      ...(updates.role !== undefined && { new_role: updates.role }),
      ...(updates.is_active !== undefined && { new_is_active: updates.is_active }),
    }).catch(() => {});

    return NextResponse.json(data);
  } catch (error) {
    console.error('PATCH /api/team/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/team/[id]
 *
 * Delete a team member. If they have a linked auth account, deletes that too.
 *
 * @auth Required (super admin)
 * @param id - Team member UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    // Require super admin
    const { data: currentUser } = await adminClient
      .from('users')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!currentUser?.is_super_admin) {
      return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
    }

    // Get team member
    const { data: member } = await adminClient
      .from('team_members')
      .select('user_id, full_name')
      .eq('id', id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Prevent deleting yourself
    if (member.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    // Unlink from tables that reference team_members(id) without CASCADE
    await adminClient.from('tasks').update({ assignee_id: null }).eq('assignee_id', id);

    // If linked, delete the auth account + users record first
    if (member.user_id) {
      await adminClient.from('users').delete().eq('id', member.user_id);
      await adminClient.auth.admin.deleteUser(member.user_id).catch(() => {});
    }

    // Delete the team member record
    const { error } = await adminClient
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete team member:', error);
      return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 });
    }

    logActivity(user.id, 'team_member_deleted', 'user', id, {
      member_name: member.full_name,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/team/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
