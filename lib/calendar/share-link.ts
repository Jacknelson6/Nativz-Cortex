import type { SupabaseClient } from '@supabase/supabase-js';

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
    .select('id, token')
    .eq('client_id', opts.clientId)
    .is('archived_at', null)
    .maybeSingle<{ id: string; token: string }>();

  if (existing) {
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
    return { ...updated, refreshed: true };
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
  return { ...created, refreshed: false };
}
