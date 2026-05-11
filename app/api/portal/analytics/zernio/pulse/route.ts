// ZNA-03: portal GET — same shape, scoped via getPortalClient(). Omits
// admin-only fields (flagged_wrong_at). Defense-in-depth org filter on top
// of RLS.

import { NextResponse } from 'next/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const portal = await getPortalClient();
  if (!portal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await admin
    .from('client_analytics_pulses')
    .select(
      'id, client_id, organization_id, pulse_date, generated_at, body, signal_metric, signal_value, platforms_referenced, referenced_post_ids, is_dismissed, is_locked',
    )
    .eq('client_id', portal.client.id)
    .eq('pulse_date', today)
    .maybeSingle();

  if (!data || data.is_dismissed) {
    return NextResponse.json({ pulse: null });
  }
  // Defense in depth: confirm the org matches the portal session.
  if (data.organization_id !== portal.organizationId) {
    return NextResponse.json({ pulse: null });
  }

  // Strip organization_id from the response shape.
  const { organization_id: _omit, ...rest } = data;
  return NextResponse.json({ pulse: rest });
}
