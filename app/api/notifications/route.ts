import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/notifications
 *
 * List notifications for the authenticated user, ordered by most recent.
 * Always returns the total unread count regardless of the unread_only filter.
 * Scoped by recipient_user_id — each user only sees their own notifications.
 *
 * @auth Required (any authenticated user)
 * @query unread_only - If 'true', only returns unread notifications
 * @returns {{ notifications: Notification[], unread_count: number }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10);
    // Cap at 100 to prevent accidental unbounded fetches; default 50.
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 50;

    let listQuery = adminClient
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, created_at')
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      listQuery = listQuery.eq('is_read', false);
    }

    const countQuery = adminClient
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    const [listRes, countRes] = await Promise.all([listQuery, countQuery]);

    if (listRes.error) {
      console.error('GET /api/notifications error:', listRes.error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
    if (countRes.error) {
      console.error('GET /api/notifications unread count error:', countRes.error);
    }

    return NextResponse.json({
      notifications: listRes.data ?? [],
      unread_count: countRes.count ?? 0,
    });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
