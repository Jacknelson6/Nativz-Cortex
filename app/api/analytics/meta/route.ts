/**
 * GET /api/analytics/meta
 *
 * Fetches Meta Ads Manager data: campaigns, ad sets, ads with insights.
 * Computes performance scores and returns structured data for the analytics dashboard.
 *
 * Query params:
 * - datePreset: last_7d | last_14d | last_30d | this_month | all_time | custom
 * - dateFrom: YYYY-MM-DD (when datePreset=custom)
 * - dateTo: YYYY-MM-DD (when datePreset=custom)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMetaConfigured, fetchMetaAdsData } from '@/lib/meta/client';
import type { DatePreset } from '@/lib/meta/types';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!isMetaConfigured()) {
      return NextResponse.json(
        { error: 'Meta Ads not configured. Set META_APP_ACCESS_TOKEN and META_AD_ACCOUNT_ID.' },
        { status: 503 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const datePreset = (searchParams.get('datePreset') || 'last_30d') as DatePreset | 'custom';
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;

    const data = await fetchMetaAdsData(datePreset, dateFrom, dateTo);

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/analytics/meta error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch Meta analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
