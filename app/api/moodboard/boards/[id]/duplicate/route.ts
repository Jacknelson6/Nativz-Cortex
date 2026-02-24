import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
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

    // Fetch original board
    const { data: board } = await adminClient.from('moodboard_boards').select('*').eq('id', id).single();
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    // Create new board
    const { data: newBoard, error: boardErr } = await adminClient
      .from('moodboard_boards')
      .insert({
        name: `${board.name} (Copy)`,
        description: board.description,
        client_id: board.client_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (boardErr || !newBoard) {
      console.error('Error duplicating board:', boardErr);
      return NextResponse.json({ error: 'Failed to duplicate board' }, { status: 500 });
    }

    // Copy items
    const { data: items } = await adminClient.from('moodboard_items').select('*').eq('board_id', id);
    const itemIdMap: Record<string, string> = {};

    if (items && items.length > 0) {
      for (const item of items) {
        const { id: oldId, created_at: _ca, updated_at: _ua, board_id: _bid, ...rest } = item;
        const { data: newItem } = await adminClient
          .from('moodboard_items')
          .insert({ ...rest, board_id: newBoard.id })
          .select('id')
          .single();
        if (newItem) itemIdMap[oldId] = newItem.id;
      }
    }

    // Copy notes
    const { data: notes } = await adminClient.from('moodboard_notes').select('*').eq('board_id', id);
    const noteIdMap: Record<string, string> = {};

    if (notes && notes.length > 0) {
      for (const note of notes) {
        const { id: oldId, created_at: _ca, updated_at: _ua, board_id: _bid, ...rest } = note;
        const { data: newNote } = await adminClient
          .from('moodboard_notes')
          .insert({ ...rest, board_id: newBoard.id })
          .select('id')
          .single();
        if (newNote) noteIdMap[oldId] = newNote.id;
      }
    }

    // Copy edges
    const { data: edges } = await adminClient.from('moodboard_edges').select('*').eq('board_id', id);
    if (edges && edges.length > 0) {
      for (const edge of edges) {
        // Map source/target node IDs
        let sourceId = edge.source_node_id;
        let targetId = edge.target_node_id;

        if (sourceId.startsWith('item-')) {
          const mapped = itemIdMap[sourceId.replace('item-', '')];
          if (mapped) sourceId = `item-${mapped}`;
        } else if (sourceId.startsWith('note-')) {
          const mapped = noteIdMap[sourceId.replace('note-', '')];
          if (mapped) sourceId = `note-${mapped}`;
        }

        if (targetId.startsWith('item-')) {
          const mapped = itemIdMap[targetId.replace('item-', '')];
          if (mapped) targetId = `item-${mapped}`;
        } else if (targetId.startsWith('note-')) {
          const mapped = noteIdMap[targetId.replace('note-', '')];
          if (mapped) targetId = `note-${mapped}`;
        }

        await adminClient.from('moodboard_edges').insert({
          board_id: newBoard.id,
          source_node_id: sourceId,
          target_node_id: targetId,
          label: edge.label,
          style: edge.style,
          color: edge.color,
        });
      }
    }

    // Copy tags
    const { data: tags } = await adminClient.from('moodboard_tags').select('*').eq('board_id', id);
    const tagIdMap: Record<string, string> = {};

    if (tags && tags.length > 0) {
      for (const tag of tags) {
        const { data: newTag } = await adminClient
          .from('moodboard_tags')
          .insert({ board_id: newBoard.id, name: tag.name, color: tag.color })
          .select('id')
          .single();
        if (newTag) tagIdMap[tag.id] = newTag.id;
      }

      // Copy item-tag associations
      const { data: itemTags } = await adminClient
        .from('moodboard_item_tags')
        .select('*')
        .in('item_id', Object.keys(itemIdMap));

      if (itemTags && itemTags.length > 0) {
        for (const it of itemTags) {
          const newItemId = itemIdMap[it.item_id];
          const newTagId = tagIdMap[it.tag_id];
          if (newItemId && newTagId) {
            await adminClient.from('moodboard_item_tags').insert({ item_id: newItemId, tag_id: newTagId });
          }
        }
      }
    }

    return NextResponse.json(newBoard, { status: 201 });
  } catch (error) {
    console.error('Duplicate board error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
