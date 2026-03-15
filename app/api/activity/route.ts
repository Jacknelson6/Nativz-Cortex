import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/activity
 *
 * Fetch recent activity log entries. Admins see all activity; portal viewers see only
 * activity related to clients in their organization.
 *
 * @auth Required (any authenticated user)
 * @query limit - Maximum number of records to return (default: 50, max: 100)
 * @returns {ActivityLogEntry[]} Array of activity log entries, most recent first
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

    const adminClient = createAdminClient();

    // Check if admin — admins see all activity, viewers see their org's
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    let query = adminClient
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Non-admin viewers: filter to activity related to their org's clients
    if (userData?.role !== 'admin' && userData?.organization_id) {
      const { data: orgClients } = await adminClient
        .from('clients')
        .select('id')
        .eq('organization_id', userData.organization_id);

      const clientIds = (orgClients ?? []).map((c) => c.id);
      if (clientIds.length > 0) {
        query = query.in('entity_id', clientIds);
      } else {
        return NextResponse.json([]);
      }
    }

    const { data: activity, error } = await query;

    if (error) {
      console.error('Error fetching activity:', error);
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }

    return NextResponse.json(activity ?? []);
  } catch (error) {
    console.error('GET /api/activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
