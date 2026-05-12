/**
 * Unified Zernio notification entrypoint.
 *
 * Pre-existing helpers each own their own dedup mechanism:
 *
 *  - `notifyZernioPostFailureGuarded` uses `scheduled_posts.failure_notification_sent_at`
 *  - `notifyConnectionExpired` relies on the caller to stamp `social_profiles.disconnect_alerted_at`
 *  - the stuck-publishing chat alert uses `scheduled_posts.stuck_publishing_alerted_at`
 *  - the daily reconciler's `Zernio lost a post` warn uses the same column as `post_failed`
 *
 * Four different columns, four different reset rules, no single audit
 * trail. This module funnels every NEW notification call through one
 * function backed by one ledger (`zernio_notifications_sent`). Existing
 * helpers stay (per the durability-fix PRD's "no big bang" note) — new
 * code routes here.
 *
 * Dedup contract: a (kind, targetId) pair can only send once. Re-arm
 * the channel by deleting the ledger row (e.g. on successful republish).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationType } from '@/lib/notifications';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';

export type ZernioNotifyKind =
  | 'post_failed'
  | 'post_partial_failed'
  | 'post_stuck_publishing'
  | 'post_zernio_lost'
  | 'connection_expired'
  | 'connection_expired_post_time';

export type ZernioNotifyChannel = 'in_app' | 'chat' | 'both';

export interface ZernioNotifyInApp {
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}

export interface ZernioNotifyParams {
  kind: ZernioNotifyKind;
  /**
   * Stable per-incident identifier. Convention:
   *
   *   `post_*`               → `scheduled_posts.id` (NOT late_post_id; that
   *                            rotates on retry and would re-arm dedup)
   *   `connection_expired*`  → `social_profiles.id`
   *
   * The (kind, targetId) pair is the dedup key.
   */
  targetId: string;
  channel?: ZernioNotifyChannel;
  inApp?: ZernioNotifyInApp;
  /**
   * Caller-supplied chat dispatch. Invoked only after dedup wins so we
   * never fire two chat cards for the same incident. Errors bubble to
   * the catch below and mark the send as failed.
   */
  chat?: () => Promise<void> | void;
  context?: Record<string, unknown>;
}

export interface ZernioNotifyResult {
  sent: boolean;
  reason?: string;
}

const DEFAULT_CHANNEL: ZernioNotifyChannel = 'in_app';

/**
 * Send a Zernio notification, deduped via `zernio_notifications_sent`.
 *
 * Returns `{ sent: true }` when this call won the dedup race and the
 * dispatch succeeded; `{ sent: false, reason }` otherwise. Reasons:
 *
 *  - `already_notified`     — a prior call won the (kind, targetId) PK
 *  - `dedup_insert_failed`  — Postgres rejected the insert for a non-PK reason
 *  - `dispatch_failed`      — dedup won but the channel send threw
 */
export async function notifyZernio(
  params: ZernioNotifyParams,
): Promise<ZernioNotifyResult> {
  const admin = createAdminClient();
  const channel = params.channel ?? DEFAULT_CHANNEL;

  const { error: dedupError } = await admin
    .from('zernio_notifications_sent')
    .insert({
      kind: params.kind,
      target_id: params.targetId,
      context: params.context ?? null,
    });

  if (dedupError) {
    // Postgres unique-violation. The (kind, targetId) pair was already
    // claimed by a prior call; this is the happy "we already sent it"
    // path, not an error.
    if (dedupError.code === '23505') {
      return { sent: false, reason: 'already_notified' };
    }
    console.error(
      `[zernio-notify] dedup insert failed for ${params.kind}/${params.targetId}:`,
      dedupError.message,
    );
    return { sent: false, reason: 'dedup_insert_failed' };
  }

  try {
    if ((channel === 'in_app' || channel === 'both') && params.inApp) {
      await notifyZernioWebhookRecipients(params.inApp);
    }
    if ((channel === 'chat' || channel === 'both') && params.chat) {
      await params.chat();
    }
    return { sent: true };
  } catch (err) {
    console.error(
      `[zernio-notify] dispatch failed for ${params.kind}/${params.targetId}:`,
      err,
    );
    return { sent: false, reason: 'dispatch_failed' };
  }
}

/**
 * Clear the dedup mark so the next `notifyZernio` for this pair can
 * fire again. Call sites: successful republish (clears `post_failed`),
 * token reconnect (clears `connection_expired`).
 *
 * Best-effort: errors are logged, not thrown. A stale ledger row that
 * fails to delete just means one missed re-arm — preferable to crashing
 * the publish path.
 */
export async function clearZernioNotifyMark(
  kind: ZernioNotifyKind,
  targetId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('zernio_notifications_sent')
    .delete()
    .eq('kind', kind)
    .eq('target_id', targetId);
  if (error) {
    console.error(
      `[zernio-notify] clear mark failed for ${kind}/${targetId}:`,
      error.message,
    );
  }
}
