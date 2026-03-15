import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

/**
 * GET /api/notifications/preferences
 *
 * Fetch the authenticated user's notification preferences, merged with defaults
 * so all preference keys are always present.
 *
 * @auth Required (any authenticated user)
 * @returns {NotificationPreferences} User's notification preference object
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(data?.notification_preferences ?? {}),
    };

    return NextResponse.json(prefs);
  } catch (error) {
    console.error('GET /api/notifications/preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/notifications/preferences
 *
 * Replace the authenticated user's notification preferences with the provided object.
 *
 * @auth Required (any authenticated user)
 * @body The full notification preferences object to save
 * @returns {{ ok: true }}
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    const admin = createAdminClient();
    const { error } = await admin
      .from('users')
      .update({ notification_preferences: body })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to save notification preferences:', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/notifications/preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
