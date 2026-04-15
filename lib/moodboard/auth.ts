import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

interface BoardAccessGrant {
  ok: true;
  isAdmin: boolean;
  isPersonalOwner: boolean;
  /** True when the caller is a portal viewer accessing a client-scoped
   *  board whose client belongs to one of their `user_client_access` rows.
   *  Routes may use this to permit reads/writes to analysis pipelines while
   *  refusing admin-only mutations (e.g. reassigning a board's client). */
  isClientViewer: boolean;
}

/**
 * Shared auth gate for moodboard routes.
 *
 * Access rules:
 *   - `admin` / `super_admin`: any board.
 *   - Personal-board owner: their own `is_personal=true` board.
 *   - Portal viewer: any `scope='client'` board whose `client_id` appears in
 *     the caller's `user_client_access` rows. This is what makes the portal
 *     notes surface and viewer-driven topic-search analysis work without
 *     exposing board content across organizations.
 *
 * Returns `{ ok: true }` when access is granted, or a ready-to-return
 * `NextResponse` with the appropriate 401/403/404 status when not.
 */
export async function requireBoardAccess(
  boardId: string,
  user: User | null,
  adminClient: SupabaseClient,
): Promise<BoardAccessGrant | { ok: false; response: NextResponse }> {
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: userData } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  const isAdmin =
    userData?.is_super_admin === true ||
    userData?.role === 'admin' ||
    userData?.role === 'super_admin';
  const isViewer = userData?.role === 'viewer';

  const { data: board } = await adminClient
    .from('moodboard_boards')
    .select('id, user_id, is_personal, scope, client_id')
    .eq('id', boardId)
    .maybeSingle();

  if (!board) {
    return { ok: false, response: NextResponse.json({ error: 'Board not found' }, { status: 404 }) };
  }

  const isPersonalOwner = board.is_personal === true && board.user_id === user.id;

  if (isAdmin || isPersonalOwner) {
    return { ok: true, isAdmin, isPersonalOwner, isClientViewer: false };
  }

  // Portal viewer path — client-scoped board, board's client in viewer's access list.
  if (isViewer && board.scope === 'client' && board.client_id) {
    const { data: access } = await adminClient
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', board.client_id)
      .maybeSingle();

    if (access) {
      return { ok: true, isAdmin: false, isPersonalOwner: false, isClientViewer: true };
    }
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
