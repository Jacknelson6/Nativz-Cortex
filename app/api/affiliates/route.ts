import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string(),
  end: z.string(),
});

/**
 * GET /api/affiliates
 *
 * Fetch comprehensive affiliate analytics for a client within a date range. Returns KPIs
 * (new/total/active affiliates, referrals, revenue, commission, clicks, pending payouts),
 * snapshot trend data for charts, a ranked list of top affiliates with period performance,
 * recent referrals, and pending payout details.
 *
 * @auth Required (admin)
 * @query clientId - Client UUID (required)
 * @query start - Start date in YYYY-MM-DD format (required)
 * @query end - End date in YYYY-MM-DD format (required)
 * @returns {{ kpis, snapshots, topAffiliates, recentReferrals, pendingPayouts }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { clientId, start, end } = parsed.data;
    const payload = await fetchAffiliateAnalyticsRange(admin, clientId, start, end);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/affiliates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
