import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/analysis/tags/[id]
 *
 * Permanently delete a tag. Cascades to all moodboard_item_tags associations.
 *
 * @auth Required (admin)
 * @param id - Tag UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const { error } = await adminClient.from('moodboard_tags').delete().eq('id', id);

    if (error) {
      console.error('Error deleting tag:', error);
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE tag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
