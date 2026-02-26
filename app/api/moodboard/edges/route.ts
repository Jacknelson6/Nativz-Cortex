import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createEdgeSchema = z.object({
  board_id: z.string().uuid(),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  label: z.string().max(200).optional().nullable(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional().default('solid'),
  color: z.string().max(20).optional().default('#888888'),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const boardId = request.nextUrl.searchParams.get('board_id');
    if (!boardId) {
      return NextResponse.json({ error: 'board_id required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: edges, error } = await adminClient
      .from('moodboard_edges')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching edges:', error);
      return NextResponse.json({ error: 'Failed to fetch edges' }, { status: 500 });
    }

    return NextResponse.json(edges);
  } catch (error) {
    console.error('GET /api/moodboard/edges error:', error);
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
    const parsed = createEdgeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: edge, error: insertError } = await adminClient
      .from('moodboard_edges')
      .insert({
        board_id: parsed.data.board_id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        label: parsed.data.label || null,
        style: parsed.data.style,
        color: parsed.data.color,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating edge:', insertError);
      return NextResponse.json({ error: 'Failed to create edge' }, { status: 500 });
    }

    return NextResponse.json(edge, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/edges error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
