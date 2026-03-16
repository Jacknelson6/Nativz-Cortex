import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/analysis/boards/[id]/search
 *
 * Full-text search for items within a board. Searches across title, transcript,
 * concept_summary, hook, and author_name using case-insensitive ILIKE. Returns
 * matching item IDs for the client to highlight/filter.
 *
 * @auth Required (admin)
 * @param id - Board UUID
 * @query q - Search query string (required)
 * @returns {{ item_ids: string[] }}
 */
export async function GET(
  request: NextRequest,
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
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q) return NextResponse.json({ error: 'q parameter required' }, { status: 400 });

    const pattern = `%${q}%`;

    const { data: items, error } = await adminClient
      .from('moodboard_items')
      .select('id')
      .eq('board_id', id)
      .or(`title.ilike.${pattern},transcript.ilike.${pattern},concept_summary.ilike.${pattern},hook.ilike.${pattern},author_name.ilike.${pattern}`);

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ item_ids: (items || []).map((i: { id: string }) => i.id) });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
