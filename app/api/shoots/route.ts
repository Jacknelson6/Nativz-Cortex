import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createShootSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  shoot_date: z.string().min(1, 'Date is required'),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  client_ids: z.array(z.string().uuid()).min(1, 'At least one client is required'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createShootSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, shoot_date, location, notes, client_ids } = parsed.data;

    const rows = client_ids.map((client_id) => ({
      title,
      shoot_date,
      location: location || null,
      notes: notes || null,
      client_id,
      plan_status: 'pending' as const,
      created_by: user.id,
    }));

    const { error: insertError, data: inserted } = await adminClient
      .from('shoot_events')
      .insert(rows)
      .select('id');

    if (insertError) {
      console.error('POST /api/shoots insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create shoot events' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: inserted?.length ?? 0 });
  } catch (error) {
    console.error('POST /api/shoots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
