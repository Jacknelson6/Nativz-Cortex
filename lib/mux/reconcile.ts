import { getMux } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pull-mode reconciler for a single content_drop_videos row that's
 * mid-Mux-pipeline. Used both by:
 *   - the share-link GET handler (self-heals any in-flight rows on
 *     every page view, so the webhook landing or not is no longer a
 *     correctness dependency — it's just a speed optimisation)
 *   - the one-shot scripts/reconcile-mux-uploads.ts script
 *
 * Returns the patch we wrote (or null if nothing changed).
 */
export type ReconcileTarget = {
  id: string;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_status: string | null;
};

export type ReconcilePatch = {
  mux_status?: string;
  mux_asset_id?: string;
  mux_playback_id?: string;
  revised_video_url?: string;
};

export async function reconcileMuxRow(
  admin: SupabaseClient,
  row: ReconcileTarget,
): Promise<ReconcilePatch | null> {
  const mux = getMux();
  let assetId = row.mux_asset_id;

  // Step 1: derive asset id from upload if we don't have it.
  if (!assetId && row.mux_upload_id) {
    try {
      const upload = await mux.video.uploads.retrieve(row.mux_upload_id);
      assetId = upload.asset_id ?? null;
    } catch (err) {
      console.warn('[mux-reconcile] upload retrieve failed', {
        rowId: row.id,
        uploadId: row.mux_upload_id,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  if (!assetId) return null;

  // Step 2: pull asset state.
  let asset;
  try {
    asset = await mux.video.assets.retrieve(assetId);
  } catch (err) {
    console.warn('[mux-reconcile] asset retrieve failed', {
      rowId: row.id,
      assetId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const publicId = asset.playback_ids?.find((p) => p.policy === 'public');
  const playbackId = publicId?.id ?? null;

  const patch: ReconcilePatch = { mux_asset_id: assetId };
  if (asset.status === 'ready' && playbackId) {
    patch.mux_status = 'ready';
    patch.mux_playback_id = playbackId;
    patch.revised_video_url = `https://stream.mux.com/${playbackId}.m3u8`;
  } else if (asset.status === 'errored') {
    patch.mux_status = 'errored';
  } else {
    patch.mux_status = 'processing';
  }

  // Skip the write if every field already matches — avoids needless
  // contention on hot rows.
  const noChange =
    patch.mux_status === row.mux_status &&
    patch.mux_asset_id === row.mux_asset_id &&
    patch.mux_playback_id === undefined;
  if (noChange) return null;

  const { error } = await admin
    .from('content_drop_videos')
    .update(patch)
    .eq('id', row.id);
  if (error) {
    console.warn('[mux-reconcile] update failed', { rowId: row.id, err: error.message });
    return null;
  }
  return patch;
}
