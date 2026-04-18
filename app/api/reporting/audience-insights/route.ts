/**
 * GET /api/reporting/audience-insights?clientId=<uuid>
 *
 * Pulls Zernio audience insights for every Zernio-connected profile on the
 * client. Zernio 404s when a platform/plan doesn't expose this data —
 * that's normal, not an error — so the response shape includes only
 * platforms that actually returned something.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting/zernio';

export const maxDuration = 45;

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  // Portal viewers must only see insights for clients in their org.
  if (userRow?.role !== 'admin') {
    const { data: client } = await adminClient
      .from('clients')
      .select('organization_id')
      .eq('id', clientId)
      .single();
    if (!client || client.organization_id !== userRow?.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: profiles } = await adminClient
    .from('social_profiles')
    .select('id, platform, late_account_id, username')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .not('late_account_id', 'is', null);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ insights: [] });
  }

  const zernio = new ZernioPostingService();
  const insights = await Promise.all(
    profiles.map(async (p) => {
      const data = await zernio.getAudienceInsights(p.late_account_id as string);
      if (!data) return null;
      return {
        platform: p.platform,
        username: p.username,
        ...data,
      };
    }),
  );

  return NextResponse.json({
    insights: insights.filter((x) => x !== null),
  });
}
