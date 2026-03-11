import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  client_id: z.string().uuid().nullable().optional(),
  shoot_date: z.string().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  scheduled_status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

async function verifyAdmin(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: shoot, error } = await adminClient
      .from('shoot_events')
      .select('*, clients(id, name, slug)')
      .eq('id', id)
      .single();

    if (error || !shoot) {
      return NextResponse.json({ error: 'Shoot not found' }, { status: 404 });
    }

    return NextResponse.json(shoot);
  } catch (error) {
    console.error('GET /api/shoots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const { data: shoot, error } = await adminClient
      .from('shoot_events')
      .update(parsed.data)
      .eq('id', id)
      .select('*, clients(id, name, slug)')
      .single();

    if (error) {
      console.error('PATCH /api/shoots/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update shoot event' }, { status: 500 });
    }

    if (!shoot) {
      return NextResponse.json({ error: 'Shoot not found' }, { status: 404 });
    }

    return NextResponse.json(shoot);
  } catch (error) {
    console.error('PATCH /api/shoots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('shoot_events')
      .update({ scheduled_status: 'cancelled' })
      .eq('id', id);

    if (error) {
      console.error('DELETE /api/shoots/[id] error:', error);
      return NextResponse.json({ error: 'Failed to cancel shoot' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/shoots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
