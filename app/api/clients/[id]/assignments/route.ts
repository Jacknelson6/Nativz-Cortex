import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createAssignmentSchema = z.object({
  team_member_id: z.string().uuid(),
  role: z.string().max(100).optional().nullable(),
  is_lead: z.boolean().optional().default(false),
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('client_assignments')
      .select('*, team_member:team_members(*)')
      .eq('client_id', clientId)
      .order('is_lead', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/clients/[id]/assignments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('client_assignments')
      .insert({ client_id: clientId, ...parsed.data })
      .select('*, team_member:team_members(*)')
      .single();

    if (error) {
      console.error('Error creating assignment:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Team member already assigned to this client' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/clients/[id]/assignments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
