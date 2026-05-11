// VFF-04 T10: GET /api/admin/formats/rejected
// Paginated list of rejected viral_videos with reason + platform filters.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(40),
  reason: z.string().min(1).max(40).optional(),
  platform: z.enum(['tiktok', 'instagram', 'youtube']).optional(),
});

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
    .single();
  const allowed =
    me &&
    (ADMIN_ROLES.includes((me as { role: string }).role) ||
      (me as { is_super_admin?: boolean }).is_super_admin);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const { page, page_size, reason, platform } = parsed.data;
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = admin
    .from('viral_videos')
    .select(
      'id, platform, source_url, creator_handle, thumbnail_storage_url, thumbnail_source_url, views_count, duration_seconds, reject_reason, gate_metadata, posted_at, created_at',
      { count: 'exact' },
    )
    .eq('analysis_status', 'rejected')
    .order('gated_at', { ascending: false, nullsFirst: false })
    .range(from, to);
  if (reason) q = q.eq('reject_reason', reason);
  if (platform) q = q.eq('platform', platform);

  const { data: videos, count, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    videos: videos ?? [],
    total: count ?? 0,
    page,
    page_size,
  });
}
