import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createTeamMemberSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional().default(true),
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

export async function GET(
  _request: NextRequest,
) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      .order('full_name');

    if (error) {
      console.error('Error fetching team members:', error);
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = createTeamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('team_members')
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      console.error('Error creating team member:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Team member already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
