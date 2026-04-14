import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Shared auth gate for moodboard routes.
 *
 * Non-admin callers can only touch personal boards they own.
 * Admins can touch any board.
 *
 * Returns `{ ok: true }` when access is granted, or a ready-to-return
 * `NextResponse` with the appropriate 401/403/404 status when not.
 *
 * Usage:
 *   const gate = await requireBoardAccess(boardId, user, adminClient);
 *   if (!gate.ok) return gate.response;
 */
export async function requireBoardAccess(
  boardId: string,
  user: User | null,
  adminClient: SupabaseClient,
): Promise<{ ok: true; isAdmin: boolean; isPersonalOwner: boolean } | { ok: false; response: NextResponse }> {
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.role === 'admin';

  const { data: board } = await adminClient
    .from('moodboard_boards')
    .select('id, user_id, is_personal')
    .eq('id', boardId)
    .maybeSingle();

  if (!board) {
    return { ok: false, response: NextResponse.json({ error: 'Board not found' }, { status: 404 }) };
  }

  const isPersonalOwner = board.is_personal === true && board.user_id === user.id;

  if (isAdmin || isPersonalOwner) {
    return { ok: true, isAdmin, isPersonalOwner };
  }

  return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

/**
 * Same contract as requireBoardAccess but keyed off an item id — resolves
 * the parent board and delegates. Used by item-scoped routes.
 */
export async function requireItemBoardAccess(
  itemId: string,
  user: User | null,
  adminClient: SupabaseClient,
): ReturnType<typeof requireBoardAccess> {
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: item } = await adminClient
    .from('moodboard_items')
    .select('board_id')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) {
    return { ok: false, response: NextResponse.json({ error: 'Item not found' }, { status: 404 }) };
  }

  return requireBoardAccess(item.board_id, user, adminClient);
}
