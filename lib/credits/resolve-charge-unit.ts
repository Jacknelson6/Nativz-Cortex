/**
 * resolveChargeUnit — pick the canonical (kind, id, deliverableType) tuple
 * for a credit consume/refund event.
 *
 * Priority:
 *   1. content_drop_videos.id  (preferred — the actual creative output)
 *   2. scheduled_posts.id      (fallback — a one-off Zernio scheduled post
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
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeUnitKind, DeliverableTypeSlug } from './types';

export interface ChargeUnit {
  kind: ChargeUnitKind;
  id: string;
  deliverableTypeSlug: DeliverableTypeSlug;
}

export interface ResolveChargeUnitArgs {
  scheduledPostId: string;
}

/**
 * Returns null if no drop_video AND no scheduled_post can be located —
 * the caller should treat that as "nothing to charge / refund."
 */
export async function resolveChargeUnit(
  supabase: SupabaseClient,
  args: ResolveChargeUnitArgs,
): Promise<ChargeUnit | null> {
  // Prefer drop_video if one points at this scheduled_post.
  const { data: dv } = await supabase
    .from('content_drop_videos')
    .select('id')
    .eq('scheduled_post_id', args.scheduledPostId)
    .limit(1)
    .maybeSingle();

  if (dv?.id) {
    return {
      kind: 'drop_video',
      id: dv.id as string,
      deliverableTypeSlug: 'edited_video',
    };
  }

  // Fallback: charge against the scheduled_post itself, but only if it
  // actually exists.
  const { data: sp } = await supabase
    .from('scheduled_posts')
    .select('id')
    .eq('id', args.scheduledPostId)
    .limit(1)
    .maybeSingle();

  if (sp?.id) {
    return {
      kind: 'scheduled_post',
      id: sp.id as string,
      deliverableTypeSlug: 'edited_video',
    };
  }

  return null;
}
