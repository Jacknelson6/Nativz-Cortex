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

    let query = adminClient
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, created_at')
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('GET /api/notifications error:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Always return total unread count regardless of filter
    const { count: unreadCount, error: countError } = await adminClient
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    if (countError) {
      console.error('GET /api/notifications unread count error:', countError);
    }

    return NextResponse.json({
      notifications: notifications ?? [],
      unread_count: unreadCount ?? 0,
    });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
