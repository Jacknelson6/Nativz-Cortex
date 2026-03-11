import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

export type NotificationType =
  | 'task_assigned'
  | 'task_due_tomorrow'
  | 'task_overdue'
  | 'task_completed'
  | 'post_top_performer'
  | 'engagement_spike'
  | 'follower_milestone'
  | 'sync_failed'
  | 'post_published'
  | 'post_failed'
  | 'post_trending';

/** Load merged notification preferences for a user */
export async function getUserNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('notification_preferences')
    .eq('id', userId)
    .single();
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data?.notification_preferences ?? {}) };
}

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  message?: string;
  linkPath?: string;
  taskId?: string;
}) {
  const admin = createAdminClient();
  const linkPath = params.linkPath ?? (params.taskId ? `/admin/tasks?task=${params.taskId}` : null);
  const { error } = await admin.from('notifications').insert({
    recipient_user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? params.message ?? null,
    link_path: linkPath,
    is_read: false,
    email_sent: false,
  });
  if (error) console.error('Failed to create notification:', error);
}

/** Check if a notification type is allowed by user preferences */
function isNotificationAllowed(
  prefs: NotificationPreferences,
  type: NotificationType,
): boolean {
  if (!prefs.inApp) return false;

  switch (type) {
    case 'post_top_performer':
      return prefs.engagementOutlier.enabled;
    case 'engagement_spike':
      return prefs.engagementSpike.enabled;
    case 'follower_milestone':
      return prefs.followerMilestone.enabled;
    case 'post_trending':
      return prefs.trendingPost?.enabled ?? true;
    default:
      return true; // task/sync/post notifications always allowed if inApp is on
  }
}

/** Notify all admin users (respects per-user notification preferences) */
export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from('users')
    .select('id, notification_preferences')
    .eq('role', 'admin');

  if (!admins?.length) return;

  const rows = admins
    .filter((u) => {
      const prefs: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(u.notification_preferences ?? {}),
      };
      return isNotificationAllowed(prefs, params.type);
    })
    .map((u) => ({
      recipient_user_id: u.id,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link_path: params.linkPath ?? null,
      is_read: false,
      email_sent: false,
    }));

  if (rows.length === 0) return;

  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error('Failed to create admin notifications:', error);
}
