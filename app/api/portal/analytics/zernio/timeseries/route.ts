// ZNA-02: portal timeseries endpoint. Same shape as the admin route but
// scoped via getPortalClient() and defended in depth with an explicit
// organization_id join filter (CLAUDE.md portal security hard rule).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadZernioTimeseries } from '@/lib/analytics/zernio-timeseries';
import { computeDelta } from '@/lib/analytics/zernio-delta';
import type { AnalyticsPlatform, RangeKey } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

export async function GET(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    platform: url.searchParams.get('platform'),
    range: url.searchParams.get('range') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', issues: parsed.error.format() }, { status: 400 });
  }

  const admin = createAdminClient();
  const platform = parsed.data.platform as AnalyticsPlatform;
  const range = parsed.data.range as RangeKey;

  // Defense-in-depth: re-verify the client belongs to the portal user's org.
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', portal.client.id)
    .maybeSingle();
  if (!clientRow || clientRow.organization_id !== portal.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await admin
    .from('social_profiles')
    .select('id')
    .eq('client_id', portal.client.id)
    .eq('platform', platform)
    .eq('is_active', true)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'No social profile for this platform' }, { status: 404 });
  }

  const ts = await loadZernioTimeseries({
    supabase: admin,
    clientId: portal.client.id,
    platform,
    range,
  });
  const delta = computeDelta({ points: ts.points, range, metric: 'followers' });

  return NextResponse.json(
    {
      client_id: portal.client.id,
      platform,
      range,
      range_start: ts.range_start,
      range_end: ts.range_end,
      source: ts.source,
      points: ts.points,
      delta,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60' },
    },
  );
}
