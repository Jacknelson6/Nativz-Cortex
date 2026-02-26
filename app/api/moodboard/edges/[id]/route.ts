import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateEdgeSchema = z.object({
  label: z.string().max(200).optional().nullable(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
  color: z.string().max(20).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const parsed = updateEdgeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
    if (parsed.data.style !== undefined) updateData.style = parsed.data.style;
    if (parsed.data.color !== undefined) updateData.color = parsed.data.color;

    const { data: edge, error } = await adminClient
      .from('moodboard_edges')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating edge:', error);
      return NextResponse.json({ error: 'Failed to update edge' }, { status: 500 });
    }

    return NextResponse.json(edge);
  } catch (error) {
    console.error('PUT /api/moodboard/edges/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('moodboard_edges')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting edge:', error);
      return NextResponse.json({ error: 'Failed to delete edge' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/moodboard/edges/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
