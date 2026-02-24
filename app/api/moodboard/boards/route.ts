import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createBoardSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
});

export async function GET() {
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

    const { data: boards, error: fetchError } = await adminClient
      .from('moodboard_boards')
      .select('*, clients(name)')
      .order('updated_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching boards:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
    }

    // Get item counts per board
    const boardIds = (boards || []).map((b: Record<string, unknown>) => b.id as string);
    let itemCounts: Record<string, number> = {};

    if (boardIds.length > 0) {
      const { data: countData } = await adminClient
        .from('moodboard_items')
        .select('board_id')
        .in('board_id', boardIds);

      if (countData) {
        itemCounts = countData.reduce((acc: Record<string, number>, row: { board_id: string }) => {
          acc[row.board_id] = (acc[row.board_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Transform response
    const result = (boards || []).map((b: Record<string, unknown>) => ({
      ...b,
      client_name: (b.clients as { name: string } | null)?.name ?? null,
      item_count: itemCounts[b.id as string] || 0,
      clients: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/moodboard/boards error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const parsed = createBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: board, error: insertError } = await adminClient
      .from('moodboard_boards')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        client_id: parsed.data.client_id ?? null,
        created_by: user.id,
      })
      .select('*, clients(name)')
      .single();

    if (insertError) {
      console.error('Error creating board:', insertError);
      return NextResponse.json({ error: 'Failed to create board' }, { status: 500 });
    }

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/boards error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
