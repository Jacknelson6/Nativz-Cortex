import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const tagBodySchema = z.object({
  tag_id: z.string().uuid(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return null;
  return { user, adminClient };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const { data, error } = await auth.adminClient
      .from('moodboard_item_tags')
      .select('tag_id, moodboard_tags(*)')
      .eq('item_id', id);

    if (error) {
      console.error('Error fetching item tags:', error);
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    const tags = (data || []).map((row: Record<string, unknown>) => row.moodboard_tags).filter(Boolean);
    return NextResponse.json(tags);
  } catch (error) {
    console.error('GET item tags error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

    const { error } = await auth.adminClient
      .from('moodboard_item_tags')
      .insert({ item_id: id, tag_id: parsed.data.tag_id });

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Tag already added' }, { status: 409 });
      console.error('Error adding tag:', error);
      return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('POST item tag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

    const { error } = await auth.adminClient
      .from('moodboard_item_tags')
      .delete()
      .eq('item_id', id)
      .eq('tag_id', parsed.data.tag_id);

    if (error) {
      console.error('Error removing tag:', error);
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE item tag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
