/**
 * resolveChargeUnit, pick the canonical (kind, id, deliverableType) tuple
 * for a credit consume/refund event, plus best-effort attribution.
 *
 * Priority:
 *   1. content_drop_videos.id  (preferred, the actual creative output)
 *   2. scheduled_posts.id      (fallback, a one-off Zernio scheduled post
 *                               with no drop_video row)
 *
 * The same drop_video can be re-scheduled across multiple scheduled_posts;
 * keying on the drop_video stops "approve, reschedule, approve again"
 * patterns from charging twice.
 *
 * Phase A: every charge unit maps to `edited_video`. Phase B+ will introduce
 * UGC + static-graphic flows that resolve to their own slugs (e.g. UGC
 * uploads sit on a different table). Centralising the mapping here means
 * those additions land as one-line changes.
 *
 * Phase C: when the charge unit is a drop_video, we also surface
 * `editorUserId` (sourced from `revised_video_uploaded_by`) and
 * `deliverableId` so the consume RPC can stamp the attribution row.
 * scheduled_post fallbacks return NULL editor + NULL deliverable since
 * those rows don't track an editor explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeUnitKind, DeliverableTypeSlug } from './types';

export interface ChargeUnit {
  kind: ChargeUnitKind;
  id: string;
  deliverableTypeSlug: DeliverableTypeSlug;
  /** auth.users.id of the editor who uploaded the latest revision, or NULL. */
  editorUserId: string | null;
  /**
   * Pointer to the physical artifact, mirrors `id` for drop_video charges
   * and stays NULL for scheduled_post fallbacks (no artifact resolved yet).
   */
  deliverableId: string | null;
}

export interface ResolveChargeUnitArgs {
  scheduledPostId: string;
}

/**
 * Returns null if no drop_video AND no scheduled_post can be located,
 * the caller should treat that as "nothing to charge / refund."
 */
export async function resolveChargeUnit(
  supabase: SupabaseClient,
  args: ResolveChargeUnitArgs,
): Promise<ChargeUnit | null> {
  // Prefer drop_video if one points at this scheduled_post.
  const { data: dv } = await supabase
    .from('content_drop_videos')
    .select('id, revised_video_uploaded_by')
    .eq('scheduled_post_id', args.scheduledPostId)
    .limit(1)
    .maybeSingle<{ id: string; revised_video_uploaded_by: string | null }>();

  if (dv?.id) {
    return {
      kind: 'drop_video',
      id: dv.id,
      deliverableTypeSlug: 'edited_video',
      editorUserId: dv.revised_video_uploaded_by ?? null,
      deliverableId: dv.id,
    };
  }

  // Fallback: charge against the scheduled_post itself, but only if it
  // actually exists.
  const { data: sp } = await supabase
    .from('scheduled_posts')
    .select('id')
    .eq('id', args.scheduledPostId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (sp?.id) {
    return {
      kind: 'scheduled_post',
      id: sp.id,
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: null,
    };
  }

  return null;
}
