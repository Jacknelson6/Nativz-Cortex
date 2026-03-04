import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'client_id, start, and end are required' },
        { status: 400 }
      );
    }

    // Get Late account IDs for this client
    const adminClient = createAdminClient();
    const { data: profiles } = await adminClient
      .from('social_profiles')
      .select('late_account_id, platform')
      .eq('client_id', clientId)
      .not('late_account_id', 'is', null);

    if (!profiles?.length) {
      return NextResponse.json({ analytics: [] });
    }

    // Fetch analytics from Late for each connected account
    const service = getPostingService();
    const allAnalytics = await Promise.all(
      profiles.map(async (p) => {
        const data = await service.getAnalytics({
          accountId: p.late_account_id!,
          startDate,
          endDate,
        }).catch(() => []);
        return data.map(d => ({ ...d, platform: p.platform }));
      })
    );

    return NextResponse.json({ analytics: allAnalytics.flat() });
  } catch (error) {
    console.error('GET /api/scheduler/analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
