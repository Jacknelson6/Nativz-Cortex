import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService } from '@/lib/posting';

/**
 * Cancels the Zernio ticket attached to a `scheduled_posts` row (if any) and
 * resets the row back to the pre-approval `'draft'` state so the next client
 * approval fires a fresh ticket via `publishScheduledPost`.
 *
 * Called when an editor uploads a revised cut for a post that's already been
 * approved + queued in Zernio. Without this, Zernio still holds the original
 * cut and fires it on the scheduled date — exactly the May 4 incident.
 *
 * Order is the safe default: Zernio first (so a transient cron tick between
 * calls sees a stale-but-still-present queue entry rather than a cleared row
 * that re-publishes immediately), then DB reset. A 404 from Zernio means the
 * ticket is already gone, which is fine — we proceed with the reset.
 *
 * Returns `{ cancelled: boolean }` so callers can log/branch. `cancelled` is
 * `false` when the post had no ticket to begin with (no-op).
 */
export async function cancelZernioTicketForPost(
  admin: SupabaseClient,
  postId: string,
): Promise<{ cancelled: boolean }> {
  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, late_post_id, status')
    .eq('id', postId)
    .maybeSingle<{ id: string; late_post_id: string | null; status: string }>();
  if (!post || !post.late_post_id) {
    return { cancelled: false };
  }

  const lateId = post.late_post_id;
  const posting = getPostingService();
  try {
    await posting.deletePost(lateId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/\b404\b|not\s*found/i.test(msg)) {
      // Anything other than 404 leaves Zernio in an unknown state — abort
      // so we don't clear our DB while a live ticket still exists.
      throw new Error(`Zernio deletePost failed for ${lateId}: ${msg}`);
    }
  }

  const nowIso = new Date().toISOString();
  const { error: postErr } = await admin
    .from('scheduled_posts')
    .update({
      late_post_id: null,
      status: 'draft',
      failure_reason: null,
      external_post_id: null,
      published_at: null,
      updated_at: nowIso,
    })
    .eq('id', postId);
  if (postErr) {
    throw new Error(`Reset scheduled_posts failed for ${postId}: ${postErr.message}`);
  }

  const { error: sppErr } = await admin
    .from('scheduled_post_platforms')
    .update({
      status: 'pending',
      external_post_id: null,
      external_post_url: null,
      failure_reason: null,
    })
    .eq('post_id', postId);
  if (sppErr) {
    throw new Error(`Reset scheduled_post_platforms failed for ${postId}: ${sppErr.message}`);
  }

  return { cancelled: true };
}
