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
