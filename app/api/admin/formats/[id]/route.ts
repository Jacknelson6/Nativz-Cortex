// VFF-09 T06: GET /api/admin/formats/[id]
// Admin-only. Returns the full detail payload (video + dimensions +
// top comments + per-brand action flags). Optional ?client_id= scopes
// the flags + competitor match to a specific brand.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFormatDetail } from '@/lib/analytics/format-detail';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const QuerySchema = z.object({ client_id: z.string().uuid().optional().nullable() });

type Role = { role: string; is_super_admin: boolean | null };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParse = IdSchema.safeParse(id);
  if (!idParse.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single<Role>();
  const isSuper = me?.role === 'super_admin' || me?.is_super_admin === true;
  const isAdmin = isSuper || me?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const queryParse = QuerySchema.safeParse({ client_id: url.searchParams.get('client_id') });
  if (!queryParse.success) {
    return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
  }
  const clientId = queryParse.data.client_id ?? null;

  const payload = await getFormatDetail(idParse.data, clientId, user.id);
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(payload);
}
