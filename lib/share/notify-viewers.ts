import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';

/**
 * PRD 08 §"Notification dispatcher".
 *
 * When an admin posts a response or marks a video revised on a share link,
 * any viewer bound to that brand's organization should see it in their
 * portal bell, not just in the share thread. The existing share-comment
 * routes already wire admin-side pings; this helper handles the inverse
 * direction (admin → viewer) so portal users get the same parity.
 *
 * Recipients: every `users` row with role='viewer' and matching
 * `organization_id`. The bell endpoint (/api/notifications) already scopes
 * by recipient_user_id, so writes land in the right inboxes without
 * additional auth gymnastics.
 *
 * Fire-and-forget by design: notification write failures should never
 * roll back the comment insert.
 */

export interface NotifyViewersInput {
  clientId: string | null;
  title: string;
  body: string;
  linkPath: string;
  type?: string;
}

export async function notifyViewersOfShareEvent(
  input: NotifyViewersInput,
): Promise<void> {
  if (!input.clientId) return;

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('organization_id')
    .eq('id', input.clientId)
    .maybeSingle<{ organization_id: string | null }>();

  const organizationId = client?.organization_id ?? null;
  if (!organizationId) return;

  const { data: viewers } = await admin
    .from('users')
    .select('id')
    .eq('role', 'viewer')
    .eq('organization_id', organizationId)
    .returns<Array<{ id: string }>>();

  if (!viewers || viewers.length === 0) return;

  await Promise.all(
    viewers.map((viewer) =>
      createNotification({
        recipientUserId: viewer.id,
        type: input.type ?? 'feedback_received',
        title: input.title,
        body: input.body,
        linkPath: input.linkPath,
      }),
    ),
  );
}
