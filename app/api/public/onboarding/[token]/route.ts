import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/public/onboarding/[token]
 *
 * Public read endpoint for the client-facing timeline page. No auth —
 * possession of the share token IS the auth. Returns the tracker plus
 * all phases + checklist groups + items in one shape so the public page
 * can render without additional round-trips.
 *
 * Uses the admin client (service role) to bypass RLS after matching the
 * token. Nothing sensitive is returned; the shape matches what RankPrompt
 * exposes on their equivalent page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: tracker, error: trackerErr } = await admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, started_at, completed_at, clients!inner(name, slug, logo_url)')
      .eq('share_token', token)
      .maybeSingle();

    if (trackerErr || !tracker) {
      // Don't leak whether the token was malformed vs just wrong — both 404.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [phasesRes, groupsRes] = await Promise.all([
      admin
        .from('onboarding_phases')
        .select('id, name, description, what_we_need, status, sort_order, actions, progress_percent')
        .eq('tracker_id', tracker.id)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_checklist_groups')
        .select('id, name, sort_order')
        .eq('tracker_id', tracker.id)
        .order('sort_order', { ascending: true }),
    ]);

    const groupIds = (groupsRes.data ?? []).map((g) => g.id);
    const { data: items } = groupIds.length
      ? await admin
          .from('onboarding_checklist_items')
          .select('id, group_id, task, description, owner, status, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

    return NextResponse.json({
      tracker,
      phases: phasesRes.data ?? [],
      groups: groupsRes.data ?? [],
      items: items ?? [],
    });
  } catch (error) {
    console.error('GET /api/public/onboarding/[token] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
