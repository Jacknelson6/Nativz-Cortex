import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_ACTIVE_CLIENT_COOKIE } from '@/lib/active-brand';

/**
 * Write or clear the admin's active-brand cookie.
 *
 * Mirrors the portal `POST /api/portal/brands/switch` pattern. The cookie is
 * a UX convenience only — server reads always re-authorize via
 * `getActiveBrand`. This endpoint still validates the target brand
 * before writing so a rogue POST can't stuff an arbitrary id into the
 * cookie and cause later DB lookups to thrash.
 */
const bodySchema = z.object({
  client_id: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  const isAdmin =
    me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookieStore = await cookies();

  // Clear selection.
  if (parsed.data.client_id === null) {
    cookieStore.delete(ADMIN_ACTIVE_CLIENT_COOKIE);
    return NextResponse.json({ ok: true, client_id: null });
  }

  // Validate the target is a real, active brand before writing. The
  // `hide_from_roster` filter is intentionally omitted — the column
  // doesn't exist on all database snapshots (migration 054 gated), and
  // the "hidden" flag is a roster-display concern, not an authorization
  // one. We don't want a missing column to silently 403 every brand
  // switch.
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', parsed.data.client_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'Brand not accessible' }, { status: 403 });
  }

  cookieStore.set(ADMIN_ACTIVE_CLIENT_COOKIE, client.id, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 180 days — long enough that a returning user keeps context, short
    // enough that a stolen cookie doesn't live forever.
    maxAge: 60 * 60 * 24 * 180,
  });

  return NextResponse.json({ ok: true, client_id: client.id });
}
