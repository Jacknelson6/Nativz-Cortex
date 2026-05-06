import type { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

const TIMEOUT_PATTERNS = [
  /timed out during platform/i,
  /may have been published externally/i,
  /\btimeout\b/i,
  /\b504\b/,
  /gateway timeout/i,
];

export function looksLikeTimeout(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return TIMEOUT_PATTERNS.some((p) => p.test(reason));
}

/**
 * A spp row is reconcile-eligible if it's marked 'failed' AND either:
 *   - failure_reason matches a Zernio timeout pattern (real platform-side
 *     uncertainty — the post may have published after the wait-window lapsed), OR
 *   - failure_reason is NULL (the legacy conflation bug: Zernio reported
 *     'scheduled' / queued and our publisher mapped it to 'failed' with no
 *     reason. Those rows often end up published once the platform queue clears).
 *
 * Real, actionable failures always carry a reason string ('Caption too long',
 * 'Account not connected', etc.) so this filter doesn't catch them.
 */
function isReconcileEligible(reason: string | null | undefined): boolean {
  if (reason == null) return true;
  return looksLikeTimeout(reason);
}

type AdminClient = ReturnType<typeof createAdminClient>;

export interface VerifyResult {
  postId: string;
  reconciledPlatforms: number;
  newPostStatus: 'published' | 'partially_failed' | 'failed' | null;
  reason: 'no-late-id' | 'no-timeout-rows' | 'zernio-error' | 'no-changes' | 'reconciled';
}

/**
 * Re-poll Zernio for a post whose DB rows show a "timed out / may have been
 * published externally" failure on at least one platform leg, and reconcile
 * the local DB to match Zernio's authoritative state.
 *
 * WHY
 * Zernio's publishPost wait-window can lapse before the underlying platform
 * (FB, TikTok, etc.) returns success. Zernio reports the leg as failed with
 * "Publishing timed out during platform API call. The post may have been
 * published externally." but the platform actually did accept the post. A
 * subsequent GET /posts/{externalPostId} reflects the platform's real state.
 *
 * SAFETY
 * - Only flips status from 'failed' → 'published'. Never the reverse.
 * - Only acts on rows whose failure_reason matches a timeout pattern, so
 *   real failures (auth, content rejected, etc.) are left alone.
 * - No-op when post has no late_post_id (was never sent to Zernio).
 */
export async function verifyAndReconcilePost(
  adminClient: AdminClient,
  postId: string,
): Promise<VerifyResult> {
  const { data: post } = await adminClient
    .from('scheduled_posts')
    .select('id, status, late_post_id')
    .eq('id', postId)
    .maybeSingle();

  const latePostId = (post as { late_post_id: string | null } | null)?.late_post_id;
  if (!post || !latePostId) {
    return { postId, reconciledPlatforms: 0, newPostStatus: null, reason: 'no-late-id' };
  }

  const { data: rows } = await adminClient
    .from('scheduled_post_platforms')
    .select(
      'id, status, external_post_id, failure_reason, social_profiles!inner(late_account_id, platform)',
    )
    .eq('post_id', postId);

  type RowShape = {
    id: string;
    status: string;
    external_post_id: string | null;
    failure_reason: string | null;
    social_profiles: { late_account_id: string | null; platform: string } | null;
  };
  const allRows = (rows ?? []) as unknown as RowShape[];
  if (allRows.length === 0) {
    return { postId, reconciledPlatforms: 0, newPostStatus: null, reason: 'no-timeout-rows' };
  }

  const hasReconcileable = allRows.some(
    (r) => r.status === 'failed' && isReconcileEligible(r.failure_reason),
  );
  if (!hasReconcileable) {
    return { postId, reconciledPlatforms: 0, newPostStatus: null, reason: 'no-timeout-rows' };
  }

  let zernio;
  try {
    const service = getPostingService();
    zernio = await service.getPostStatus(latePostId);
  } catch (err) {
    console.error(`[verify-post] getPostStatus failed for ${postId}/${latePostId}:`, err);
    return { postId, reconciledPlatforms: 0, newPostStatus: null, reason: 'zernio-error' };
  }

  let reconciled = 0;
  for (const row of allRows) {
    if (row.status !== 'failed') continue;
    if (!looksLikeTimeout(row.failure_reason)) continue;

    const lateAccountId = row.social_profiles?.late_account_id;
    if (!lateAccountId) continue;
    const z = zernio.platforms.find((p) => p.profileId === lateAccountId);
    if (!z) continue;
    if (z.status !== 'published') continue;

    await adminClient
      .from('scheduled_post_platforms')
      .update({
        status: 'published',
        external_post_id: z.externalPostId ?? row.external_post_id,
        external_post_url: z.externalPostUrl ?? null,
        failure_reason: null,
      })
      .eq('id', row.id);
    reconciled++;
  }

  if (reconciled === 0) {
    return { postId, reconciledPlatforms: 0, newPostStatus: null, reason: 'no-changes' };
  }

  const { data: refreshed } = await adminClient
    .from('scheduled_post_platforms')
    .select('status')
    .eq('post_id', postId);
  const refreshedRows = (refreshed ?? []) as { status: string }[];
  const allPublished =
    refreshedRows.length > 0 && refreshedRows.every((r) => r.status === 'published');
  const anyFailed = refreshedRows.some((r) => r.status === 'failed');
  const anyPublished = refreshedRows.some((r) => r.status === 'published');

  let newPostStatus: VerifyResult['newPostStatus'] = null;
  if (allPublished) newPostStatus = 'published';
  else if (anyFailed && anyPublished) newPostStatus = 'partially_failed';
  else if (anyFailed && !anyPublished) newPostStatus = 'failed';

  if (newPostStatus) {
    const update: Record<string, unknown> = {
      status: newPostStatus,
      updated_at: new Date().toISOString(),
    };
    if (newPostStatus === 'published') {
      update.failure_reason = null;
      // Clear the dedup stamp so a future failure on this row can re-page.
      update.failure_notification_sent_at = null;
    }
    await adminClient.from('scheduled_posts').update(update).eq('id', postId);
  }

  return { postId, reconciledPlatforms: reconciled, newPostStatus, reason: 'reconciled' };
}
