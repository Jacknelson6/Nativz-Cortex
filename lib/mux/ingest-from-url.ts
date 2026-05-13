import type { SupabaseClient } from '@supabase/supabase-js';
import { getMux } from '@/lib/mux/client';

/**
 * Submit a URL-pull ingest to Mux and stamp the row with the resulting
 * `mux_asset_id` + `mux_status='processing'`. The Mux webhook
 * (`/api/mux/webhook`) flips the row to `mux_status='ready'` and writes
 * `mux_playback_id` once the asset is packaged.
 *
 * Idempotent: if the row already has `mux_asset_id`, this is a no-op. Use
 * this from any ingest path that ends up with a publicly-fetchable URL
 * (Supabase Storage, Drive direct download, etc.). The whole point is that
 * every `content_drop_videos` row ends up backed by a Mux asset so the
 * share-page player chrome is consistent — even the older Drive-sourced
 * drops that predate the Mux pipeline.
 *
 * Non-fatal failures: if Mux rejects the ingest (rate limit, bad URL, etc.)
 * we log + return `{ ok: false }` so the caller doesn't have to wrap. The
 * row keeps its `video_url` and the share page falls back to MuxPlayer's
 * `src` mode (still branded chrome, just no HLS / static MP4).
 */
export async function kickMuxIngestForContentDropVideo(
  admin: SupabaseClient,
  opts: { videoId: string; sourceUrl: string },
): Promise<{ ok: boolean; assetId?: string }> {
  // Skip if a Mux asset is already attached. Repeated /finalize or webhook
  // retries shouldn't create duplicate assets.
  const { data: row } = await admin
    .from('content_drop_videos')
    .select('mux_asset_id, mux_status')
    .eq('id', opts.videoId)
    .single<{ mux_asset_id: string | null; mux_status: string | null }>();
  if (row?.mux_asset_id) return { ok: true, assetId: row.mux_asset_id };

  try {
    const mux = getMux();
    const asset = await mux.video.assets.create({
      inputs: [{ url: opts.sourceUrl }],
      playback_policies: ['public'],
      mp4_support: 'capped-1080p',
      video_quality: 'basic',
    });
    const playback = asset.playback_ids?.find((p) => p.policy === 'public');
    await admin
      .from('content_drop_videos')
      .update({
        mux_asset_id: asset.id,
        mux_playback_id: playback?.id ?? null,
        mux_status: 'processing',
      })
      .eq('id', opts.videoId);
    return { ok: true, assetId: asset.id };
  } catch (err) {
    console.error('[mux/ingest-from-url] failed', {
      videoId: opts.videoId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}
