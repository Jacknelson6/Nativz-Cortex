import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    // Find the share link
    const { data: link, error: linkError } = await adminClient
      .from('moodboard_share_links')
      .select('*')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    // Check password if protected
    if (link.password_hash) {
      const password = request.nextUrl.searchParams.get('password')
        || request.headers.get('x-share-password');

      if (!password) {
        return NextResponse.json({ error: 'Password required', passwordRequired: true }, { status: 401 });
      }

      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== link.password_hash) {
        return NextResponse.json({ error: 'Invalid password', passwordRequired: true }, { status: 401 });
      }
    }

    // Fetch board data
    const { data: board, error: boardError } = await adminClient
      .from('moodboard_boards')
      .select('id, name, description, client_id, clients(name)')
      .eq('id', link.board_id)
      .single();

    if (boardError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Fetch items, notes, edges
    const [itemsResult, notesResult, edgesResult] = await Promise.all([
      adminClient
        .from('moodboard_items')
        .select('*')
        .eq('board_id', link.board_id)
        .order('created_at', { ascending: true }),
      adminClient
        .from('moodboard_notes')
        .select('*')
        .eq('board_id', link.board_id)
        .order('created_at', { ascending: true }),
      adminClient
        .from('moodboard_edges')
        .select('*')
        .eq('board_id', link.board_id),
    ]);

    return NextResponse.json({
      board: {
        ...board,
        client_name: (board.clients as unknown as { name: string }[] | null)?.[0]?.name ?? null,
        clients: undefined,
      },
      items: itemsResult.data || [],
      notes: notesResult.data || [],
      edges: edgesResult.data || [],
    });
  } catch (error) {
    console.error('GET /api/shared/moodboard/[token] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
