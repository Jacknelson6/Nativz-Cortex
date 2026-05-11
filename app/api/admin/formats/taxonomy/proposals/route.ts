// VFF-06 T07: GET /api/admin/formats/taxonomy/proposals
// Admin-only. Lists format taxonomy proposals filtered by status
// (default pending) ordered by proposal_count DESC.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const StatusSchema = z.enum(['pending', 'approved', 'rejected', 'merged']);
const KindSchema = z.enum(['hook_type', 'structure', 'archetype', 'pacing']);

const QuerySchema = z.object({
  status: StatusSchema.default('pending'),
  kind: KindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

type Role = { role: string; is_super_admin: boolean | null };

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single<Role>();
  const isSuper = me?.role === 'super_admin' || me?.is_super_admin === true;
  const isAdmin = isSuper || me?.role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const { status, kind, limit } = parsed.data;

  let q = admin
    .from('format_taxonomy_proposals')
    .select(
      'id, kind, slug, display_name, proposed_description, evidence_video_id, proposal_count, status, merged_into_format_id, reviewed_by, reviewed_at, created_at, updated_at',
    )
    .eq('status', status)
    .order('proposal_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kind) q = q.eq('kind', kind);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ proposals: data ?? [] });
}
