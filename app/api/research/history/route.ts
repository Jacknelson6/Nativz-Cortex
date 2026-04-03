import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchHistory, type HistoryItemType } from '@/lib/research/history';

/**
 * GET /api/research/history
 *
 * Fetch paginated research history items (topic searches, idea generations, etc.).
 * Supports cursor-based pagination.
 *
 * @auth Required (any authenticated user)
 * @query limit - Number of items to return (default: 20, max: 50)
 * @query type - Filter by item type (HistoryItemType)
 * @query client_id - Filter by client UUID
 * @query cursor - Pagination cursor (ISO datetime of last item's created_at)
 * @query include_ideas - Set to "false" to omit idea generations when `type` is omitted (topic search sidebar)
 * @returns {{ items: HistoryItem[] }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);
    const type = (searchParams.get('type') as HistoryItemType) || null;
    const clientId = searchParams.get('client_id') || null;
    const cursor = searchParams.get('cursor') || null;
    const includeIdeasRaw = searchParams.get('include_ideas');
    const includeIdeas = includeIdeasRaw === null ? true : includeIdeasRaw !== 'false';

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id, is_super_admin')
      .eq('id', user.id)
      .single();

    const isAdmin =
      userData?.is_super_admin === true ||
      userData?.role === 'admin' ||
      userData?.role === 'super_admin';

    const organizationId = isAdmin ? null : (userData?.organization_id as string | null) ?? null;

    if (!isAdmin && !organizationId) {
      return NextResponse.json({ items: [] });
    }

    const items = await fetchHistory({ limit, type, clientId, cursor, includeIdeas, organizationId });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
