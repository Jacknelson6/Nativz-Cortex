import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Record a late_post_id assignment in the audit log.
 *
 * - Retires any active row for the same `post_id` (a new fresh publish or
 *   retry-rotation supersedes the prior handle).
 * - Inserts a new active row for the new `late_post_id`.
 * - No-op when `newLatePostId` is null (the parent is clearing without
 *   immediately reassigning — we still want to retire active rows so the
 *   webhook fallback can find the post by the now-orphaned id).
 *
 * Best-effort: history-table writes never block the parent update. Errors
 * are logged so a broken audit chain doesn't break publish.
 */
export async function recordLatePostIdChange(
  admin: Admin,
  postId: string,
  newLatePostId: string | null,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await admin
      .from('scheduled_post_late_ids')
      .update({ retired_at: nowIso })
      .eq('post_id', postId)
      .is('retired_at', null);
    if (newLatePostId) {
      await admin
        .from('scheduled_post_late_ids')
        .insert({ post_id: postId, late_post_id: newLatePostId });
    }
  } catch (err) {
    console.error(
      `[late-post-id-history] record failed for post ${postId} -> ${newLatePostId}:`,
      err,
    );
  }
}

/**
 * Resolve a Zernio late_post_id to the parent `scheduled_posts.id` it
 * belongs to (current or historical). Returns null when the id is
 * unknown.
 *
 * The webhook handler's direct lookup hits
 * `scheduled_posts.late_post_id = ?`. After a retry rotation, that column
 * holds the NEW id, so events for the OLD id fall through. This fallback
 * checks the history table (active or retired) to recover the parent.
 */
export async function findPostByAnyLatePostId(
  admin: Admin,
  latePostId: string,
): Promise<{ postId: string; isActive: boolean } | null> {
  const { data, error } = await admin
    .from('scheduled_post_late_ids')
    .select('post_id, retired_at')
    .eq('late_post_id', latePostId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(
      `[late-post-id-history] history lookup failed for ${latePostId}:`,
      error.message,
    );
    return null;
  }
  const row = data as { post_id: string; retired_at: string | null } | null;
  if (!row) return null;
  return { postId: row.post_id, isActive: row.retired_at == null };
}
