import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createBoardSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  template_id: z.string().optional(),
});

/**
 * GET /api/analysis/boards
 *
 * List all moodboard boards, ordered by updated_at descending. Includes item counts and
 * up to 4 thumbnail URLs per board for grid previews. Excludes archived boards by default.
 *
 * @auth Required (admin)
 * @query show_archived - Pass 'true' to include archived boards (optional)
 * @returns {MoodboardBoard[]} Boards with client_name, item_count, and thumbnails
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get('show_archived') === 'true';

    let query = adminClient
      .from('moodboard_boards')
      .select('*, clients(name)')
      .order('updated_at', { ascending: false });

    if (!showArchived) {
      query = query.is('archived_at', null);
    }

    const { data: boards, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching boards:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
    }

    // Get item counts + thumbnails per board
    const boardIds = (boards || []).map((b: Record<string, unknown>) => b.id as string);
    let itemCounts: Record<string, number> = {};
    let boardThumbnails: Record<string, string[]> = {};

    if (boardIds.length > 0) {
      const { data: itemData } = await adminClient
        .from('moodboard_items')
        .select('board_id, thumbnail_url')
        .in('board_id', boardIds);

      if (itemData) {
        itemCounts = itemData.reduce((acc: Record<string, number>, row: { board_id: string }) => {
          acc[row.board_id] = (acc[row.board_id] || 0) + 1;
          return acc;
        }, {});

        boardThumbnails = itemData.reduce((acc: Record<string, string[]>, row: { board_id: string; thumbnail_url: string | null }) => {
          if (row.thumbnail_url) {
            if (!acc[row.board_id]) acc[row.board_id] = [];
            if (acc[row.board_id].length < 4) acc[row.board_id].push(row.thumbnail_url);
          }
          return acc;
        }, {});
      }
    }

    // Transform response
    const result = (boards || []).map((b: Record<string, unknown>) => ({
      ...b,
      client_name: (b.clients as { name: string } | null)?.name ?? null,
      item_count: itemCounts[b.id as string] || 0,
      thumbnails: boardThumbnails[b.id as string] || [],
      clients: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/analysis/boards error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/analysis/boards
 *
 * Create a new moodboard board. If a template_id is provided, pre-populates the board
 * with notes from the selected template.
 *
 * @auth Required (admin)
 * @body name - Board name (required, max 200 chars)
 * @body description - Board description (optional)
 * @body client_id - Associated client UUID (optional)
 * @body template_id - Template ID to pre-populate notes from (optional)
 * @returns {MoodboardBoard} Created board record
 */
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

    // If template selected, create template notes
    if (parsed.data.template_id && board) {
      const templateRes = await fetch(new URL('/api/analysis/templates', request.url));
      if (templateRes.ok) {
        const templates = await templateRes.json();
        const template = templates.find((t: { id: string }) => t.id === parsed.data.template_id);
        if (template?.notes) {
          for (const note of template.notes) {
            await adminClient.from('moodboard_notes').insert({
              board_id: board.id,
              content: note.content,
              color: note.color,
              position_x: note.position_x,
              position_y: note.position_y,
            });
          }
        }
      }
    }

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error('POST /api/analysis/boards error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
