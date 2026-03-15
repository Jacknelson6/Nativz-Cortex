import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/notifications/mark-all-read
 *
 * Mark all unread notifications as read for the authenticated user.
 * Returns the count of notifications that were marked read.
 *
 * @auth Required (any authenticated user)
 * @returns {{ success: true, count: number }} Number of notifications marked read
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Count unread before updating
    const { count, error: countError } = await adminClient
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    if (countError) {
      console.error('POST /api/notifications/mark-all-read count error:', countError);
      return NextResponse.json({ error: 'Failed to count notifications' }, { status: 500 });
    }

    const { error } = await adminClient
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('POST /api/notifications/mark-all-read error:', error);
      return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: count ?? 0 });
  } catch (error) {
    console.error('POST /api/notifications/mark-all-read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
