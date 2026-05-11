// ZNA-02: admin timeseries endpoint. Returns daily followers + rolling 7d
// views + engagements for a brand + platform, plus a delta-vs-prior summary.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadZernioTimeseries } from '@/lib/analytics/zernio-timeseries';
import { computeDelta } from '@/lib/analytics/zernio-delta';
import type { AnalyticsPlatform, RangeKey } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  client_id: z.string().uuid(),
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    client_id: url.searchParams.get('client_id'),
    platform: url.searchParams.get('platform'),
    range: url.searchParams.get('range') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', issues: parsed.error.format() }, { status: 400 });
  }

  const admin = createAdminClient();
  const platform = parsed.data.platform as AnalyticsPlatform;
  const range = parsed.data.range as RangeKey;

  // 404 if no social profile attached (UI can render an empty state).
  const { data: profile } = await admin
    .from('social_profiles')
    .select('id')
    .eq('client_id', parsed.data.client_id)
    .eq('platform', platform)
    .eq('is_active', true)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'No social profile for this platform' }, { status: 404 });
  }

  const ts = await loadZernioTimeseries({
    supabase: admin,
    clientId: parsed.data.client_id,
    platform,
    range,
  });
  const delta = computeDelta({ points: ts.points, range, metric: 'followers' });

  return NextResponse.json(
    {
      client_id: parsed.data.client_id,
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
