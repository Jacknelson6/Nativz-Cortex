import type { SupabaseClient } from '@supabase/supabase-js';
import { getMux } from '@/lib/mux/client';
import { deleteEditingObject } from './storage';

/**
 * Tear down every Mux asset + Supabase Storage object owned by an
 * editing project's videos. Called from the soft-delete and
 * hard-delete paths in `DELETE /api/admin/editing/projects/:id` so
 * "Delete" in content-tools actually frees the underlying bytes,
 * not just the row.
 *
 * Why split this out: both delete paths (soft archive vs hard row
 * drop) need the same media teardown, and the per-video DELETE
 * endpoint can reuse the same Mux unhook for parity (previously the
 * single-video DELETE removed Supabase storage but left the Mux
 * asset live and billable).
 *
 * Every call is best-effort: if Mux 404s or the storage object is
 * already gone, we swallow the error and keep going. The DB row is
 * the source of truth; an orphan Mux asset is a billing problem,
 * not a correctness problem, so we don't want a single failed
 * delete to abort the whole sweep.
 */
export async function teardownEditingProjectMedia(
  admin: SupabaseClient,
  projectId: string,
): Promise<{ muxDeleted: number; storageDeleted: number; muxFailed: number }> {
  const { data: videos } = await admin
    .from('editing_project_videos')
    .select('id, mux_asset_id, storage_path')
    .eq('project_id', projectId);

  let muxDeleted = 0;
  let muxFailed = 0;
  let storageDeleted = 0;

  if (!videos || videos.length === 0) {
    return { muxDeleted, storageDeleted, muxFailed };
  }

  // Mux client only matters if we actually have an asset to delete.
  // Calling getMux() throws when MUX_TOKEN_ID/SECRET are missing, so
  // we lazy-construct inside the loop to avoid blowing up image-only
  // projects on misconfigured envs.
  let mux: ReturnType<typeof getMux> | null = null;

  for (const v of videos) {
    if (v.mux_asset_id) {
      try {
        if (!mux) mux = getMux();
        await mux.video.assets.delete(v.mux_asset_id);
        muxDeleted += 1;
      } catch (err) {
        muxFailed += 1;
        console.warn(
          `[editing-teardown] mux delete failed for asset ${v.mux_asset_id} (video ${v.id}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (v.storage_path && v.storage_path !== 'pending') {
      await deleteEditingObject(admin, v.storage_path).catch((err) => {
        console.warn(
          `[editing-teardown] storage delete failed for ${v.storage_path}:`,
          err instanceof Error ? err.message : err,
        );
      });
      storageDeleted += 1;
    }
  }

  return { muxDeleted, storageDeleted, muxFailed };
}
