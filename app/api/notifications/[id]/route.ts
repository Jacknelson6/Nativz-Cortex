import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateNotificationSchema = z.object({
  read: z.boolean(),
});

/**
 * PATCH /api/notifications/[id]
 *
 * Mark a specific notification as read or unread. Only the recipient can update their own notification.
 *
 * @auth Required (any authenticated user)
 * @param id - Notification UUID
 * @body read - Boolean indicating whether to mark read (true) or unread (false)
 * @returns {Notification} Updated notification record
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateNotificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const { data: notification, error } = await adminClient
      .from('notifications')
      .update({ is_read: parsed.data.read })
      .eq('id', id)
      .eq('recipient_user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/notifications/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json(notification);
  } catch (error) {
    console.error('PATCH /api/notifications/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
