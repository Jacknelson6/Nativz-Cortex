import { getMux } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pull-mode reconciler for a single Mux-backed video row that's
 * mid-pipeline. Self-heals any in-flight rows on every relevant page
 * view, so the webhook landing or not is just a speed optimisation,
 * not a correctness dependency.
 *
 * Used by:
 *   - share-link GET handlers (SMM + editing) on every page view
 *   - scripts/reconcile-mux-uploads.ts (one-shot sweeper)
 *
 * The two video-row schemas differ:
 *   - content_drop_videos has revised_video_url / revised_mp4_url
 *     columns the publish cron consumes (Zernio + Late ingest don't
 *     read HLS manifests, so we keep the static MP4 url separate).
 *   - editing_project_videos / editing_project_raw_videos derive their
 *     playback URLs from mux_playback_id at read time — no URL columns.
 *
 * To keep both flows on one reconciler, the caller passes a
 * `ReconcileBinding` that says which table to write and (optionally)
 * which URL columns to stamp. Returns the patch we wrote, or null if
 * nothing changed.
 */
export type ReconcileTarget = {
  id: string;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_status: string | null;
  revised_mp4_url?: string | null;
};

export type ReconcilePatch = {
  mux_status?: string;
  mux_asset_id?: string;
  mux_playback_id?: string;
  revised_video_url?: string;
  revised_mp4_url?: string;
};

export type ReconcileBinding = {
  /** Postgres table name to UPDATE. */
  table: string;
  /**
   * Where to stamp the playback URLs once the asset is ready. SMM uses
   * `revised_video_url`/`revised_mp4_url`; editing tables omit this and
   * let consumers derive URLs from mux_playback_id at render time.
   */
  urlFields?: {
    hlsColumn: string;
    mp4Column: string;
  };
};

const DEFAULT_BINDING: ReconcileBinding = {
  table: 'content_drop_videos',
  urlFields: {
    hlsColumn: 'revised_video_url',
    mp4Column: 'revised_mp4_url',
  },
};

export async function reconcileMuxRow(
  admin: SupabaseClient,
  row: ReconcileTarget,
  binding: ReconcileBinding = DEFAULT_BINDING,
): Promise<ReconcilePatch | null> {
  const mux = getMux();
  let assetId = row.mux_asset_id;

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

  const patch: ReconcilePatch & Record<string, unknown> = { mux_asset_id: assetId };
  if (asset.status === 'ready' && playbackId) {
    patch.mux_status = 'ready';
    patch.mux_playback_id = playbackId;
    if (binding.urlFields) {
      patch[binding.urlFields.hlsColumn] = `https://stream.mux.com/${playbackId}.m3u8`;
    }
  } else if (asset.status === 'errored') {
    patch.mux_status = 'errored';
  } else {
    patch.mux_status = 'processing';
  }

  // Static MP4 rendition. The publish cron requires this for SMM rows
  // (Zernio / Late can't read HLS manifests). Stamped independently of
  // mux_status so a partial state (HLS ready, MP4 still rendering) is
  // observable rather than collapsed into one boolean. Editing tables
  // don't need an MP4 column, so we only stamp it when the binding
  // says where to put it.
  if (
    playbackId &&
    asset.static_renditions?.status === 'ready' &&
    binding.urlFields &&
    !row.revised_mp4_url
  ) {
    patch[binding.urlFields.mp4Column] = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`;
  }

  const noChange =
    patch.mux_status === row.mux_status &&
    patch.mux_asset_id === row.mux_asset_id &&
    patch.mux_playback_id === undefined &&
    (!binding.urlFields ||
      patch[binding.urlFields.mp4Column] === undefined);
  if (noChange) return null;

  const { error } = await admin
    .from(binding.table)
    .update(patch)
    .eq('id', row.id);
  if (error) {
    console.warn('[mux-reconcile] update failed', {
      rowId: row.id,
      table: binding.table,
      err: error.message,
    });
    return null;
  }
  return patch as ReconcilePatch;
}
