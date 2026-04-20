/**
 * GET /api/analytics/client-series?clientId=<uuid>&platform=<tiktok|instagram|youtube|facebook>&start=<iso>&end=<iso>
 *
 * Returns the client's own follower time series so the benchmarking chart
 * can overlay "Your account" next to tracked competitors — the
 * "how are we doing relative to them?" read, not just "how are they doing
 * relative to each other?".
 *
 * Data source is `platform_follower_daily` (rolled up from Zernio + snapshot
 * backfill — see migration 117). Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PLATFORMS = ['tiktok', 'instagram', 'facebook', 'youtube'] as const;

const querySchema = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(PLATFORMS).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') {
    // Portal viewers are allowed to see their own client's series.
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', parsed.data.clientId)
      .maybeSingle();
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let query = admin
    .from('platform_follower_daily')
    .select('day, platform, followers')
    .eq('client_id', parsed.data.clientId)
    .order('day', { ascending: true });

  if (parsed.data.platform) query = query.eq('platform', parsed.data.platform);
  if (parsed.data.start) query = query.gte('day', parsed.data.start);
  if (parsed.data.end) query = query.lte('day', parsed.data.end);

  const { data, error } = await query;
  if (error) {
    console.error('[client-series] query failed', error);
    return NextResponse.json({ error: 'Failed to load client series' }, { status: 500 });
  }

  // Shape: { series: [{ day, platform, followers }, ...] } — the client
  // component reshapes per-chart (some want per-platform, some want summed).
  return NextResponse.json({ series: data ?? [] });
}
