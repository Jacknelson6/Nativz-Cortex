/**
 * GET /api/instagram/insights?account_id=...&period=day|week|days_28
 *
 * Account-level insights: reach, impressions, engagement, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInstagramConfigured, getAccountInsights } from '@/lib/instagram/client';

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

    if (!isInstagramConfigured()) {
      return NextResponse.json({ error: 'Instagram not configured' }, { status: 503 });
    }

    const accountId = request.nextUrl.searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const period = (request.nextUrl.searchParams.get('period') || 'days_28') as 'day' | 'week' | 'days_28';

    const insights = await getAccountInsights(accountId, period);
    return NextResponse.json({ insights });
  } catch (error) {
    console.error('GET /api/instagram/insights error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
