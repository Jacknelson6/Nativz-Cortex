import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Curated palette keys mirror GROUP_COLORS in the client grid UI. Keeping
// the allowed set in one list here lets us reject bad values at the API
// boundary without importing client code on the server.
const GROUP_COLOR_KEYS = [
  'cyan',
  'purple',
  'coral',
  'emerald',
  'amber',
  'rose',
  'teal',
  'slate',
] as const;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(GROUP_COLOR_KEYS).optional(),
});

/**
 * GET /api/client-groups
 * Admin-only list of client pipeline groups, ordered by sort_order.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (me?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('client_groups')
      .select('id, name, color, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('GET /api/client-groups query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ groups: data ?? [] });
  } catch (error) {
    console.error('GET /api/client-groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/client-groups
 * Create a new group. sort_order defaults to end of list.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (me?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    // Append at the end: one more than the current max sort_order.
    const { data: maxRow } = await admin
      .from('client_groups')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await admin
      .from('client_groups')
      .insert({
        name: parsed.data.name,
        color: parsed.data.color ?? 'slate',
        sort_order: nextSort,
        created_by: user.id,
      })
      .select('id, name, color, sort_order, created_at, updated_at')
      .single();

    if (error) {
      console.error('POST /api/client-groups insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ group: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/client-groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
