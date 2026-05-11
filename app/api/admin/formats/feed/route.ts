// VFF-07: GET /api/admin/formats/feed
// Admin-only. Returns the 8-row Netflix feed for /admin/formats.
// Wraps buildFormatFeed; 60s in-memory cache keyed by client_id.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFormatFeed, type FormatFeedPayload } from '@/lib/analytics/format-feed';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  // Optional in practice: when admins haven't selected a brand pill the
  // feed falls back to global rows. The PRD's "required" framing is for
  // brand-scoped paths; we keep nullable for the no-brand admin view.
  client_id: z.string().uuid().nullable().optional(),
  row_cap: z.coerce.number().int().min(4).max(20).default(16),
});

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; payload: FormatFeedPayload }>();

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
  const parsed = QuerySchema.safeParse({
    client_id: url.searchParams.get('client_id') ?? undefined,
    row_cap: url.searchParams.get('row_cap') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const clientId = parsed.data.client_id ?? null;
  const rowCap = parsed.data.row_cap;

  const cacheKey = `${clientId ?? 'global'}:${rowCap}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: { 'x-cache': 'hit' },
    });
  }

  const payload = await buildFormatFeed(clientId, { rowCap });
  cache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } });
}
