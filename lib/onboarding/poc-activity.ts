import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bump the parent onboarding_flow's `last_poc_activity_at` cursor when
 * the public POC view does anything write-y (toggle item, upload file,
 * connect a social account, paste an asset link). This cursor is what
 * the 48h reminder cron + 5-day no-progress flag both reference, so it
 * needs to track every meaningful client touch.
 *
 * Resolves the flow via the flow_segments junction. Trackers that are
 * not attached to a flow (legacy single-tracker model) silently no-op —
 * this is forward-compatible with the new model without breaking the
 * old.
 */
export async function bumpPocActivityForTracker(
  admin: SupabaseClient,
  trackerId: string,
): Promise<void> {
  const { data } = await admin
    .from('onboarding_flow_segments')
    .select('flow_id')
    .eq('tracker_id', trackerId)
    .maybeSingle();
  const flowId = (data as { flow_id: string } | null)?.flow_id ?? null;
  if (!flowId) return;
  await admin
    .from('onboarding_flows')
    .update({ last_poc_activity_at: new Date().toISOString() })
    .eq('id', flowId);
}

/** Direct version when the flow id is already known (e.g. share-token GET on /onboarding/[flow_share_token]). */
export async function bumpPocActivityForFlow(
  admin: SupabaseClient,
  flowId: string,
): Promise<void> {
  await admin
    .from('onboarding_flows')
    .update({ last_poc_activity_at: new Date().toISOString() })
    .eq('id', flowId);
}
