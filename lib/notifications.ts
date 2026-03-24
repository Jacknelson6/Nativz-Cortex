import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

/** Stored on `notifications.body` for sync/error detail (keep UI readable). */
export const NOTIFICATION_BODY_MAX_LENGTH = 2000;

export function truncateNotificationBody(text: string): string {
  if (text.length <= NOTIFICATION_BODY_MAX_LENGTH) return text;
  return `${text.slice(0, NOTIFICATION_BODY_MAX_LENGTH - 1)}…`;
}

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
  | 'post_trending'
  | 'account_disconnected';

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

/**
 * Notify admin users. If clientId is provided, only notifies:
 * - Team members assigned to that client (via client_assignments)
 * - Owners (is_owner = true, always see everything)
 * If no clientId, notifies all admins (broadcast).
 */
export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
  clientId?: string;
}) {
  const admin = createAdminClient();

  let recipientIds: string[] = [];

  if (params.clientId) {
    // Scoped: get team members assigned to this client + owners
    const [assignmentsResult, ownersResult] = await Promise.all([
      admin
        .from('client_assignments')
        .select('team_members!inner(user_id)')
        .eq('client_id', params.clientId),
      admin
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('is_owner', true),
    ]);

    const assignedUserIds = new Set<string>();
    for (const row of assignmentsResult.data ?? []) {
      const tm = row.team_members as unknown as { user_id: string | null };
      if (tm?.user_id) assignedUserIds.add(tm.user_id);
    }
    for (const owner of ownersResult.data ?? []) {
      assignedUserIds.add(owner.id);
    }
    recipientIds = Array.from(assignedUserIds);
  } else {
    // Broadcast: all admins
    const { data: admins } = await admin
      .from('users')
      .select('id')
      .eq('role', 'admin');
    recipientIds = (admins ?? []).map((u) => u.id);
  }

  if (recipientIds.length === 0) return;

  // Load preferences and filter
  const { data: usersWithPrefs } = await admin
    .from('users')
    .select('id, notification_preferences')
    .in('id', recipientIds);

  const rows = (usersWithPrefs ?? [])
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

/**
 * Notify portal users in a specific organization (client-facing notifications).
 */
export async function notifyOrganization(params: {
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}) {
  const admin = createAdminClient();
  const { data: portalUsers } = await admin
    .from('users')
    .select('id, notification_preferences')
    .eq('organization_id', params.organizationId)
    .eq('role', 'viewer');

  if (!portalUsers?.length) return;

  const rows = portalUsers
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
  if (error) console.error('Failed to create org notifications:', error);
}
