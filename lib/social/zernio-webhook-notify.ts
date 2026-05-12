/**
 * Resolve who receives in-app alerts for Zernio scheduler webhooks
 * (post failures, account disconnects).
 *
 * Env (any combination):
 * - ZERNIO_WEBHOOK_NOTIFY_USER_IDS — comma-separated auth user UUIDs
 * - ZERNIO_WEBHOOK_NOTIFY_EMAILS — comma-separated emails; matched against
 *   public.users (admin) by email, then team_members.email + user_id
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification, truncateNotificationBody, type NotificationType } from '@/lib/notifications';

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns distinct Cortex user ids to notify. Empty if not configured
 * (caller should log and skip).
 */
export async function getZernioWebhookNotifyUserIds(): Promise<string[]> {
  const fromIds = parseList(process.env.ZERNIO_WEBHOOK_NOTIFY_USER_IDS);
  const ids = new Set(fromIds);

  const emailsWanted = new Set(
    parseList(process.env.ZERNIO_WEBHOOK_NOTIFY_EMAILS).map((e) => e.toLowerCase()),
  );
  if (emailsWanted.size === 0) {
    return [...ids];
  }

  const admin = createAdminClient();

  const { data: userRows, error: usersError } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'admin');

  if (usersError) {
    console.error('[zernio-webhook-notify] users lookup failed:', usersError.message);
  }

  const matchedEmails = new Set<string>();
  for (const r of userRows ?? []) {
    const em = typeof r.email === 'string' ? r.email.toLowerCase() : '';
    if (em && emailsWanted.has(em) && r.id) {
      ids.add(r.id);
      matchedEmails.add(em);
    }
  }

  const stillMissing = [...emailsWanted].filter((e) => !matchedEmails.has(e));
  if (stillMissing.length > 0) {
    const { data: teamRows, error: teamError } = await admin
      .from('team_members')
      .select('user_id, email')
      .not('user_id', 'is', null);

    if (teamError) {
      console.error('[zernio-webhook-notify] team_members lookup failed:', teamError.message);
    }
    for (const r of teamRows ?? []) {
      const em = typeof r.email === 'string' ? r.email.toLowerCase() : '';
      if (em && stillMissing.includes(em) && r.user_id) {
        ids.add(r.user_id);
      }
    }
  }

  return [...ids];
}

export async function notifyZernioWebhookRecipients(params: {
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}): Promise<void> {
  const userIds = await getZernioWebhookNotifyUserIds();
  if (userIds.length === 0) {
    console.warn(
      '[zernio-webhook] No recipients: set ZERNIO_WEBHOOK_NOTIFY_USER_IDS and/or ZERNIO_WEBHOOK_NOTIFY_EMAILS',
    );
    return;
  }

  const body = params.body ? truncateNotificationBody(params.body) : undefined;
  await Promise.all(
    userIds.map((userId) =>
      createNotification({
        userId,
        type: params.type,
        title: params.title,
        body,
        linkPath: params.linkPath,
      }),
    ),
  );
}

/**
 * Post-failure notify guarded by `scheduled_posts.failure_notification_sent_at`.
 *
 * Both the webhook handler (`post.failed` event) and the daily reconciler can
 * detect the same failure within seconds of each other. Without a dedup
 * sentinel, ops gets two emails for the same incident. We stamp the column
 * atomically with the notify call; if it's already set we no-op.
 *
 * The stamp is cleared on the next successful publish (publish-posts cron
 * resets `failure_notification_sent_at: null` when a row transitions back
 * to `published`), so a caption-edit + republish that fails again will
 * re-page.
 */
export async function notifyZernioPostFailureGuarded(params: {
  adminClient: ReturnType<typeof createAdminClient>;
  latePostId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { adminClient, latePostId } = params;

  const { data: row } = await adminClient
    .from('scheduled_posts')
    .select('id, failure_notification_sent_at')
    .eq('late_post_id', latePostId)
    .maybeSingle();
  const parent = row as { id: string; failure_notification_sent_at: string | null } | null;
  if (!parent) {
    return { sent: false, reason: 'no_parent_for_late_post_id' };
  }
  if (parent.failure_notification_sent_at) {
    return { sent: false, reason: 'already_notified' };
  }

  // Stamp the dedup column first via conditional update so a parallel worker's
  // dedup check sees us. If 0 rows match the `.is null` guard, another worker
  // beat us — skip notify.
  const stampedAt = new Date().toISOString();
  const { data: stamped, error: stampErr } = await adminClient
    .from('scheduled_posts')
    .update({ failure_notification_sent_at: stampedAt })
    .eq('id', parent.id)
    .is('failure_notification_sent_at', null)
    .select('id')
    .maybeSingle();
  if (stampErr) {
    console.error(
      `[zernio-notify-guarded] failed to stamp dedup column for ${parent.id}:`,
      stampErr,
    );
    return { sent: false, reason: 'stamp_failed' };
  }
  if (!stamped) {
    return { sent: false, reason: 'lost_dedup_race' };
  }

  await notifyZernioWebhookRecipients({
    type: params.type,
    title: params.title,
    body: params.body,
    linkPath: params.linkPath,
  });
  return { sent: true };
}
