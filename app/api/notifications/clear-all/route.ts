import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/notifications/clear-all
 *
 * Deletes all notifications for the authenticated user (inbox clear).
 *
 * @auth Required (any authenticated user)
 * @returns {{ success: true }}
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('notifications')
      .delete()
      .eq('recipient_user_id', user.id);

    if (error) {
      console.error('POST /api/notifications/clear-all error:', error);
      return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/notifications/clear-all error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
