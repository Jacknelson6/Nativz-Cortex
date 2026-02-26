import { createAdminClient } from '@/lib/supabase/admin';

interface CreateNotificationParams {
  recipientUserId: string;
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
}

/**
 * Insert a notification row. Non-blocking — errors are logged, never thrown.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const adminClient = createAdminClient();
    await adminClient.from('notifications').insert({
      recipient_user_id: params.recipientUserId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link_path: params.linkPath || null,
      is_read: false,
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}
