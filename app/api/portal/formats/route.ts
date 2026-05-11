/**
 * GET /api/portal/formats
 *
 * VFF-10 T13: Returns the pinned-format reels the portal viewer's
 * organization has curated. Read-only — viewers cannot pin, dismiss, or
 * use formats; admins manage the library and the viewer browses it.
 *
 * @auth Required (viewer). Admin role is refused — the admin tools are
 *   already on /admin/formats and a 200 here would be misleading.
 */

import { NextResponse } from 'next/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPinnedFormats } from '@/lib/portal/get-pinned-formats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Block admins from this portal-only endpoint so they don't confuse it
  // with /admin/formats and end up depending on the read-only shape.
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (me as { role: string | null } | null)?.role ?? null;
  if (role === 'admin' || role === 'super_admin') {
    return NextResponse.json(
      { error: 'Admins should use /admin/formats. This endpoint is portal-only.' },
      { status: 403 },
    );
  }

  const portal = await getPortalClient();
  if (!portal) {
    return NextResponse.json({ error: 'No portal access' }, { status: 403 });
  }

  try {
    const formats = await getPinnedFormats(portal.organizationId);
    return NextResponse.json({ formats });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load pinned formats', detail: String(err) },
      { status: 500 },
    );
  }
}
