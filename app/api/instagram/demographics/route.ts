/**
 * GET /api/instagram/demographics?account_id=...
 *
 * Audience demographics: age/gender breakdown, top cities, top countries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInstagramConfigured, getAudienceDemographics } from '@/lib/instagram/client';

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

    const demographics = await getAudienceDemographics(accountId);
    return NextResponse.json({ demographics });
  } catch (error) {
    console.error('GET /api/instagram/demographics error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch demographics' },
      { status: 500 }
    );
  }
}
