import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService } from '@/lib/posting';

/**
 * Single source of truth for minting a content-drop share link.
 *
 * Jack's mental model is "the project IS the share link" — re-sharing
 * a brand should refresh the existing project row, not spawn a new one.
 * Migration 208 enforces that with a partial unique index
 * (`uniq_active_share_link_per_client`); this helper lets the call
 * sites cooperate with the constraint instead of fighting it.
 *
 * Behavior:
 *   - If an active (non-archived) share link exists for `clientId`,
 *     update it to point at the new drop. The token stays the same so
 *     any URL the client already has keeps working, now showing the
 *     refreshed content cycle.
 *   - If no active link exists, insert a fresh one with `clientId`
 *     denormalized so the unique index can do its job.
 *   - **Orphan cancellation (SafeStop incident, 2026-04-30):** when a
 *     refresh drops posts that were already approved and queued in
 *     Zernio, this helper now actively withdraws them. Without that
 *     step, an admin could "pull" a post from a share link without
 *     realizing Zernio still owned its publish slot — exactly what
 *     happened to SafeStop. Already-published posts can't be unpublished
 *     and are surfaced via `unpublishableOrphans` instead.
 *
 * Counters reset on refresh so a stale "Last followup 4d ago" badge
 * doesn't carry over to a brand-new content cycle. The previous link's
 * comment history stays attached to the old `post_review_link_map`
 * pointers; nothing destructive happens to past review activity.
 *
 * The 30-day token TTL is renewed every refresh — the client gets a
 * full review window each time we hand them a new cycle.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface MintOrRefreshShareLinkResult {
  id: string;
  token: string;
  expires_at: string;
  /** True when an existing row was refreshed; false on first share. */
  refreshed: boolean;
  /**
   * Post IDs that were in the previous share link but not in the new
   * one. They were queued in Zernio from a prior approval; this helper
   * called `DELETE /posts/:id` on each and reverted their row to
   * `status='draft'`. Empty array on first share or when no posts were
   * dropped.
   */
  cancelledOrphans: string[];
  /**
   * Orphans that already published before the refresh ran. Zernio
   * cannot unpublish, so these are returned for the caller to surface.
   */
  unpublishableOrphans: string[];
}

export async function mintOrRefreshShareLink(
  admin: SupabaseClient,
  opts: {
    dropId: string;
    clientId: string;
    postIds: string[];
    reviewMap: Record<string, string>;
  },
): Promise<MintOrRefreshShareLinkResult> {
  const newExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  // Look up the brand's active share link first. The partial unique
  // index guarantees at most one row matches.
  const { data: existing } = await admin
    .from('content_drop_share_links')
    .select('id, token, included_post_ids')
    .eq('client_id', opts.clientId)
    .is('archived_at', null)
    .maybeSingle<{ id: string; token: string; included_post_ids: string[] | null }>();

  if (existing) {
    // Diff old vs new included_post_ids — anything in the OLD set but
    // not the new is an "orphan" that the refresh is implicitly
    // dropping. If we don't withdraw orphans from Zernio, an approved
    // post can keep its publish slot even after the admin pulls it
    // (SafeStop incident, 2026-04-30).
    const oldIds = Array.isArray(existing.included_post_ids)
      ? existing.included_post_ids
      : [];
    const newIdSet = new Set(opts.postIds);
    const orphanIds = oldIds.filter((id) => !newIdSet.has(id));

    const { cancelled, unpublishable } = await cancelOrphanPostsInZernio(
      admin,
      orphanIds,
    );

    const { data: updated, error: updateErr } = await admin
      .from('content_drop_share_links')
      .update({
        drop_id: opts.dropId,
        included_post_ids: opts.postIds,
        post_review_link_map: opts.reviewMap,
        expires_at: newExpiresAt,
        // Reset cycle-scoped state so a fresh content drop doesn't
        // inherit the previous cycle's followup badge or "abandoned"
        // mark.
        last_viewed_at: null,
        last_followup_at: null,
        followup_count: 0,
        abandoned_at: null,
      })
      .eq('id', existing.id)
      .select('id, token, expires_at')
      .single<{ id: string; token: string; expires_at: string }>();

    if (updateErr || !updated) {
      throw new Error(
        updateErr?.message ?? 'Failed to refresh existing share link',
      );
    }
    return {
      ...updated,
      refreshed: true,
      cancelledOrphans: cancelled,
      unpublishableOrphans: unpublishable,
    };
  }

  const { data: created, error: insertErr } = await admin
    .from('content_drop_share_links')
    .insert({
      drop_id: opts.dropId,
      client_id: opts.clientId,
      included_post_ids: opts.postIds,
      post_review_link_map: opts.reviewMap,
    })
    .select('id, token, expires_at')
    .single<{ id: string; token: string; expires_at: string }>();

  if (insertErr || !created) {
    throw new Error(insertErr?.message ?? 'Failed to create share link');
  }
  return {
    ...created,
    refreshed: false,
    cancelledOrphans: [],
    unpublishableOrphans: [],
  };
}

/**
 * Withdraw orphan posts from Zernio so they don't publish behind our back.
 *
 * For each orphan:
 *   - status='scheduled' AND late_post_id present → DELETE in Zernio,
 *     revert row to status='draft' and clear `late_post_id`. The admin
 *     can re-include or hard-delete later.
 *   - status='published' → can't unpublish; report as unpublishable.
 *   - status='draft' or anything else → no Zernio side effect needed,
 *     just leaves the row alone.
 *
 * Failures from Zernio are logged but non-fatal — better to ship the
 * share-link refresh than to block on a single 5xx. The unhealthy rows
 * stay flagged via `late_post_id` until the next refresh retries them.
 */
async function cancelOrphanPostsInZernio(
  admin: SupabaseClient,
  orphanIds: string[],
): Promise<{ cancelled: string[]; unpublishable: string[] }> {
  if (orphanIds.length === 0) {
    return { cancelled: [], unpublishable: [] };
  }

  const { data: orphans } = await admin
    .from('scheduled_posts')
    .select('id, status, late_post_id')
    .in('id', orphanIds);

  const cancelled: string[] = [];
  const unpublishable: string[] = [];
  if (!orphans?.length) return { cancelled, unpublishable };

  const service = getPostingService();

  for (const row of orphans as Array<{
    id: string;
    status: string;
    late_post_id: string | null;
  }>) {
    if (row.status === 'published' || row.status === 'partially_failed') {
      // Already shipped on at least one platform — Zernio can't reverse
      // that. Surface so the admin can manually delete from each platform.
      if (row.late_post_id) unpublishable.push(row.id);
      continue;
    }

    if (!row.late_post_id) continue; // never reached Zernio, nothing to cancel

    if (row.status !== 'scheduled' && row.status !== 'publishing') {
      // 'draft' or 'failed' — no live Zernio post.
      continue;
    }

    try {
      await service.deletePost(row.late_post_id);
    } catch (err) {
      console.error(
        `[share-link] orphan-cancel: Zernio DELETE failed for post ${row.id} (late_post_id=${row.late_post_id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Don't `continue` — still revert the DB so the post stops looking
      // "scheduled" in our UI. Zernio cleanup can be retried by another
      // admin action.
    }

    await admin
      .from('scheduled_posts')
      .update({
        status: 'draft',
        late_post_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    cancelled.push(row.id);
  }

  return { cancelled, unpublishable };
}
