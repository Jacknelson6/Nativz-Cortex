import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const linkSchema = z.object({
  user_id: z.string().uuid(),
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid user_id is required' }, { status: 400 });
    }

    const { user_id } = parsed.data;
    const adminClient = createAdminClient();

    // Verify team member exists and isn't already linked
    const { data: member } = await adminClient
      .from('team_members')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (member.user_id) {
      return NextResponse.json({ error: 'Team member already linked to an account' }, { status: 400 });
    }

    // Verify user exists and is an admin
    const { data: targetUser } = await adminClient
      .from('users')
      .select('id, full_name, role')
      .eq('id', user_id)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check this user isn't already linked to another team member
    const { data: existing } = await adminClient
      .from('team_members')
      .select('id, full_name')
      .eq('user_id', user_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `This account is already linked to ${existing.full_name}` },
        { status: 409 },
      );
    }

    // Link them
    const { data, error } = await adminClient
      .from('team_members')
      .update({ user_id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to link team member:', error);
      return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/team/[id]/link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Unlink a team member from their account
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('team_members')
      .update({ user_id: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to unlink team member:', error);
      return NextResponse.json({ error: 'Failed to unlink account' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('DELETE /api/team/[id]/link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
