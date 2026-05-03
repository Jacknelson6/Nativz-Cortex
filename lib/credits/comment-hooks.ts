/**
 * Higher-level credit hooks fired from the share-link comment route.
 *
 * The route layer handles auth, comment writes, and notifications; these
 * helpers handle credit accounting. Three triggers live here:
 *
 *   1. consumeForApproval — fired when a `comment.status === 'approved'`
 *      row is inserted. Resolves the charge unit (content_drop_videos.id
 *      preferred, scheduled_posts.id fallback) and calls `consume_credit`.
 *      State-based dedup means re-approval (delete+approve cycle) correctly
 *      produces one net consume.
 *
 *   2. refundForUnapproval — fired when:
 *        a. an approved comment is DELETEd (approval revoked), OR
 *        b. a `changes_requested` comment is inserted on a post that
 *           already has a prior `approved` row (silent-overcharge fix).
 *      Calls `refund_credit`. State-based dedup makes a no-op safe when
 *      the latest consume is already refunded.
 *
 *   3. The third trigger (`scheduled_post` BEFORE DELETE cascade) lives
 *      in the database trigger `trg_scheduled_posts_refund_credit`, not
 *      in this file.
 *
 * All hooks log + swallow errors. The comment route's primary purpose is
 * to record reviewer feedback; credit accounting failures should not
 * block that.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveChargeUnit } from './resolve-charge-unit';
import { consumeCredit } from './consume';
import { refundCredit } from './refund';

export interface ConsumeForApprovalArgs {
  scheduledPostId: string;
  shareLinkId: string;
  reviewerName: string;
  /**
   * The share-link comment surface only collects `authorName`, no email.
   * Stamp it onto `reviewer_email` for audit purposes — the column is
   * lightly typed (text) and exists primarily so admins can trace who
   * triggered the consume. Pass real email here when one is available
   * (e.g. portal-authenticated approval flows).
   */
  reviewerEmail?: string | null;
}

export async function consumeForApproval(
  admin: SupabaseClient,
  args: ConsumeForApprovalArgs,
): Promise<void> {
  try {
    const charge = await resolveChargeUnit(admin, { scheduledPostId: args.scheduledPostId });
    if (!charge) {
      console.warn(
        `[credits] consume skipped: no charge unit for scheduled_post ${args.scheduledPostId}`,
      );
      return;
    }
    // scheduled_posts has client_id directly (NOT NULL). One-off Zernio
    // posts (no drop_video link) still resolve correctly because the
    // fallback path in resolveChargeUnit returns kind='scheduled_post'.
    const { data: post } = await admin
      .from('scheduled_posts')
      .select('client_id')
      .eq('id', args.scheduledPostId)
      .maybeSingle<{ client_id: string | null }>();
    const clientId = post?.client_id ?? null;
    if (!clientId) {
      console.warn(
        `[credits] consume skipped: no client_id for scheduled_post ${args.scheduledPostId}`,
      );
      return;
    }
    const result = await consumeCredit(admin, {
      clientId,
      chargeUnitKind: charge.kind,
      chargeUnitId: charge.id,
      scheduledPostId: args.scheduledPostId,
      shareLinkId: args.shareLinkId,
      reviewerEmail: args.reviewerEmail ?? args.reviewerName,
    });
    if ('already_consumed' in result && result.already_consumed) {
      // Re-approval, no-op. Don't log — common path.
      return;
    }
  } catch (err) {
    console.error(
      `[credits] consumeForApproval failed for scheduled_post ${args.scheduledPostId}:`,
      err,
    );
  }
}

export interface RefundForUnapprovalArgs {
  scheduledPostId: string;
  /**
   * Free-text reason stamped on the refund row's `note` column. Surfaces
   * in the admin ledger for forensics ("approval deleted", "follow-up
   * changes_requested after approval", etc).
   */
  reason: string;
}

export async function refundForUnapproval(
  admin: SupabaseClient,
  args: RefundForUnapprovalArgs,
): Promise<void> {
  try {
    const charge = await resolveChargeUnit(admin, { scheduledPostId: args.scheduledPostId });
    if (!charge) {
      console.warn(
        `[credits] refund skipped: no charge unit for scheduled_post ${args.scheduledPostId}`,
      );
      return;
    }
    await refundCredit(admin, {
      chargeUnitKind: charge.kind,
      chargeUnitId: charge.id,
      note: args.reason,
    });
  } catch (err) {
    console.error(
      `[credits] refundForUnapproval failed for scheduled_post ${args.scheduledPostId}:`,
      err,
    );
  }
}

/**
 * Detect whether a non-approval comment is following a prior `approved`
 * row on the same review_link_id — the silent-overcharge case the spec
 * calls out. Returns true if at least one approved comment already
 * exists for this review_link_id.
 *
 * The state-based-dedup `refund_credit` RPC is itself idempotent, so
 * this guard exists mostly to avoid a useless RPC round-trip on the
 * common path (most changes_requested comments have no prior approval).
 */
export async function hasPriorApproval(
  admin: SupabaseClient,
  reviewLinkId: string,
): Promise<boolean> {
  const { count } = await admin
    .from('post_review_comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_link_id', reviewLinkId)
    .eq('status', 'approved');
  return (count ?? 0) > 0;
}
