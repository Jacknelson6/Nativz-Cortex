import { createAdminClient } from '@/lib/supabase/admin';
import type { ShareLinkKind } from '@/lib/share/identity';

/**
 * PRD 06 audit logger. Writes one row to `share_link_admin_actions`
 * for every admin write that hits a share-scoped endpoint. Fire-and-
 * forget by design, the unified review modal reads this trail later,
 * but the action itself should not roll back if the log write fails.
 *
 * Known `action` keys:
 *  - content.replace
 *  - cover.change
 *  - cover.reset
 *  - post.delete
 *  - video.delete
 *  - revision.mark_revised
 *  - comment.admin_response.create
 *  - auth.login
 *  - auth.login.failed
 */

export type ShareAdminAction =
  | 'content.replace'
  | 'cover.change'
  | 'cover.reset'
  | 'post.delete'
  | 'video.delete'
  | 'revision.mark_revised'
  | 'comment.admin_response.create'
  | 'auth.login'
  | 'auth.login.failed';

export type ShareAuditTargetKind =
  | 'post'
  | 'video'
  | 'comment'
  | 'revision'
  | 'cover'
  | 'auth'
  | null;

export interface LogShareAdminActionInput {
  shareLinkId: string;
  shareLinkKind: ShareLinkKind;
  actorUserId: string | null;
  action: ShareAdminAction;
  targetKind?: ShareAuditTargetKind;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}

export async function logShareAdminAction(
  input: LogShareAdminActionInput,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('share_link_admin_actions').insert({
    share_link_id: input.shareLinkId,
    share_link_kind: input.shareLinkKind,
    actor_user_id: input.actorUserId,
    action: input.action,
    target_kind: input.targetKind ?? null,
    target_id: input.targetId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    // Audit log failure must not block the action. Surface to logs so
    // we can spot a pattern of failures (e.g. table missing in a stale
    // env) without rolling back the user-visible operation.
    console.warn('[share-audit] insert failed', {
      action: input.action,
      shareLinkId: input.shareLinkId,
      error: error.message,
    });
  }
}
