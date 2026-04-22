import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Batched comment fetch for the admin gallery. Pass `?conceptIds=a,b,c`
 * (comma-separated) and get back { commentsByConcept: { [id]: Comment[] } }.
 * Keeps the gallery to one comment round-trip at mount regardless of
 * concept count.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const raw = req.nextUrl.searchParams.get('conceptIds') ?? '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500);
  if (ids.length === 0) {
    return NextResponse.json({ commentsByConcept: {} });
  }

  const { data, error } = await admin
    .from('ad_concept_comments')
    .select('id, concept_id, author_name, body, kind, share_token_id, resolved_at, resolved_by, created_at')
    .in('concept_id', ids)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, typeof data> = {};
  for (const c of data ?? []) {
    const id = c.concept_id as string;
    if (!map[id]) map[id] = [];
    map[id]!.push(c);
  }
  return NextResponse.json({ commentsByConcept: map });
}
