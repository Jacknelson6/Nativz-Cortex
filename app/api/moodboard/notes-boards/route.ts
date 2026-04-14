import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/moodboard/notes-boards
 * Returns every non-archived board the caller can open from the Notes
 * dashboard, including personal boards they own, team boards, and client
 * boards they have access to. Grouped client-side by the `scope` field.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userRow?.role === 'admin';

  // Admins see all non-archived team + client boards, plus their own personal.
  // Non-admins (future portal viewers) see only their own personal boards.
  let query = admin
    .from('moodboard_boards')
    .select('id, name, description, scope, user_id, client_id, created_at, updated_at, clients(name, slug)')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('user_id', user.id).eq('is_personal', true);
  }

  const { data: boards, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Item counts + latest thumbnails for dashboard cards.
  const boardIds = (boards ?? []).map((b) => b.id as string);
  let counts: Record<string, number> = {};
  let thumbs: Record<string, string[]> = {};
  if (boardIds.length > 0) {
    const { data: items } = await admin
      .from('moodboard_items')
      .select('board_id, thumbnail_url')
      .in('board_id', boardIds)
      .order('created_at', { ascending: false });
    if (items) {
      counts = items.reduce<Record<string, number>>((acc, row) => {
        const id = row.board_id as string;
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {});
      thumbs = items.reduce<Record<string, string[]>>((acc, row) => {
        const id = row.board_id as string;
        const list = acc[id] ?? [];
        if (row.thumbnail_url && list.length < 4) list.push(row.thumbnail_url);
        acc[id] = list;
        return acc;
      }, {});
    }
  }

  const enriched = (boards ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    scope: b.scope,
    user_id: b.user_id,
    client_id: b.client_id,
    client_name: (b.clients as { name?: string } | null)?.name ?? null,
    client_slug: (b.clients as { slug?: string } | null)?.slug ?? null,
    created_at: b.created_at,
    updated_at: b.updated_at,
    item_count: counts[b.id as string] ?? 0,
    thumbnails: thumbs[b.id as string] ?? [],
  }));

  return NextResponse.json({ boards: enriched });
}

/**
 * POST /api/moodboard/notes-boards
 * Create a new Notes board. Scope determines ownership:
 *   personal → caller becomes user_id
 *   client   → client_id required
 *   team     → both null (agency-wide)
 *
 * Non-admins can only create personal boards — admin-only gate matches the
 * rest of the Notes feature today (portal viewer support is deferred).
 */
const createBoardSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.enum(['personal', 'client', 'team']),
  client_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userRow?.role === 'admin';

  if (!isAdmin && parsed.data.scope !== 'personal') {
    return NextResponse.json({ error: 'Only admins can create team or client boards' }, { status: 403 });
  }

  if (parsed.data.scope === 'client' && !parsed.data.client_id) {
    return NextResponse.json({ error: 'client_id is required for client-scope boards' }, { status: 400 });
  }

  const row = {
    name: parsed.data.name.trim(),
    scope: parsed.data.scope,
    is_personal: parsed.data.scope === 'personal',
    user_id: parsed.data.scope === 'personal' ? user.id : null,
    client_id: parsed.data.scope === 'client' ? parsed.data.client_id : null,
    created_by: user.id,
  };

  const { data, error } = await admin
    .from('moodboard_boards')
    .insert(row)
    .select('id, name, scope, user_id, client_id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ board: data });
}
