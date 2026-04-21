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
  const nowIso = new Date().toISOString();

  // All four reads are independent of each other once we have the user id —
  // run them in parallel so total latency = max(query) instead of sum.
  const [userRes, bannersRes, accessRes, dismissalsRes] = await Promise.all([
    admin
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single(),
    admin
      .from('banners')
      .select<string, BannerRow>(
        'id, title, description, style, icon, link_url, link_text, start_at, end_at, event_at, position, priority, target_agency, target_role, target_client_id, active, dismissible',
      )
      .eq('active', true)
      .lte('start_at', nowIso)
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .order('priority', { ascending: false }),
    admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id),
    admin
      .from('banner_dismissals')
      .select('banner_id')
      .eq('user_id', user.id),
  ]);

  if (bannersRes.error) {
    console.error('[banners:active] query failed:', bannersRes.error);
    return NextResponse.json({ banners: [] });
  }

  const role = userRes.data?.role === 'admin' || userRes.data?.role === 'super_admin' ? 'admin' : 'viewer';
  const allBanners = bannersRes.data;
  // Admins see all clients — no need to check accessibleClientIds for them.
  const accessibleClientIds =
    role === 'viewer' ? new Set((accessRes.data ?? []).map((a) => a.client_id)) : null;
  const dismissed = new Set((dismissalsRes.data ?? []).map((d) => d.banner_id));

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
