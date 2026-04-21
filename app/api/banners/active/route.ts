/**
 * GET /api/banners/active — returns the banners that should currently
 * render for the calling user, filtered by:
 *   - time window (start_at <= now < end_at)
 *   - active flag
 *   - target agency (null = all; else matches user's active agency/domain)
 *   - target role  (null = all; else matches user's role)
 *   - target client (null = all; else matches one of the user's accessible clients)
 *   - not already dismissed by this user
 * Ordered by priority desc.
 *
 * Reads cheap — can be called on every app-shell mount.
 *
 * @auth Required (any authenticated user).
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 10;

type BannerRow = {
  id: string;
  title: string;
  description: string | null;
  style: string;
  icon: string;
  link_url: string | null;
  link_text: string | null;
  start_at: string;
  end_at: string | null;
  event_at: string | null;
  position: string;
  priority: number;
  target_agency: 'nativz' | 'anderson' | null;
  target_role: 'admin' | 'viewer' | null;
  target_client_id: string | null;
  active: boolean;
  dismissible: boolean;
};

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ banners: [] });

  const admin = createAdminClient();

  // Resolve the viewer's context: role + accessible agency + accessible client ids.
  // Admins get agency from the request's x-agency header (set by middleware for
  // domain-scoped deploys); viewers get agency from their portal client list.
  const agencyHeader = request.headers.get('x-agency') as 'nativz' | 'anderson' | null;

  const { data: userRow } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  const role = userRow?.role === 'admin' || userRow?.role === 'super_admin' ? 'admin' : 'viewer';

  // Pull all currently-live banners — the RLS "viewer_read_active" policy
  // already filters the time window + active flag at the DB layer, but we
  // use the service-role client to also include admin-only banners the
  // policy would hide. Filtering by role happens below in JS.
  const nowIso = new Date().toISOString();
  const { data: allBanners, error } = await admin
    .from('banners')
    .select<string, BannerRow>(
      'id, title, description, style, icon, link_url, link_text, start_at, end_at, event_at, position, priority, target_agency, target_role, target_client_id, active, dismissible',
    )
    .eq('active', true)
    .lte('start_at', nowIso)
    .or(`end_at.is.null,end_at.gt.${nowIso}`)
    .order('priority', { ascending: false });

  if (error) {
    console.error('[banners:active] query failed:', error);
    return NextResponse.json({ banners: [] });
  }

  // Resolve the viewer's accessible client ids (viewers only — admins see all).
  let accessibleClientIds: Set<string> | null = null;
  if (role === 'viewer') {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id);
    accessibleClientIds = new Set((access ?? []).map((a) => a.client_id));
  }

  // Fetch this user's dismissals so we can drop them from the result.
  const { data: dismissals } = await admin
    .from('banner_dismissals')
    .select('banner_id')
    .eq('user_id', user.id);
  const dismissed = new Set((dismissals ?? []).map((d) => d.banner_id));

  const filtered = (allBanners ?? []).filter((b) => {
    if (dismissed.has(b.id)) return false;
    if (b.target_role && b.target_role !== role) return false;
    if (b.target_agency && agencyHeader && b.target_agency !== agencyHeader) return false;
    if (b.target_client_id && accessibleClientIds && !accessibleClientIds.has(b.target_client_id)) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ banners: filtered });
}
