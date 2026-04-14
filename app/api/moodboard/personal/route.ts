import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreatePersonalBoard } from '@/lib/moodboard/get-or-create-personal-board';

/**
 * GET /api/moodboard/personal
 *
 * Returns the caller's personal moodboard along with all items, notes, and edges
 * on it. Auto-creates an empty personal board on first call so the Notes page
 * can mount without a separate onboarding step.
 *
 * @auth Required (any authenticated user)
 * @returns { board, items, notes, edges }
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const board = await getOrCreatePersonalBoard(user.id, adminClient);

    const [{ data: items }, { data: notes }, { data: edges }] = await Promise.all([
      adminClient
        .from('moodboard_items')
        .select('*')
        .eq('board_id', board.id)
        .order('created_at', { ascending: false }),
      adminClient
        .from('moodboard_notes')
        .select('*')
        .eq('board_id', board.id)
        .order('created_at', { ascending: true }),
      adminClient
        .from('moodboard_edges')
        .select('*')
        .eq('board_id', board.id),
    ]);

    return NextResponse.json({
      board,
      items: items ?? [],
      notes: notes ?? [],
      edges: edges ?? [],
    });
  } catch (error) {
    console.error('GET /api/moodboard/personal error:', error);
    return NextResponse.json({ error: 'Failed to load personal board' }, { status: 500 });
  }
}
