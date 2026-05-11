import type { SupabaseClient } from '@supabase/supabase-js';
import { getMux } from '@/lib/mux/client';

const ZERNIO_TEMP_HOST_RE = /^https?:\/\/[^/]*media\.zernio\.com\/temp\//i;

export function isZernioTempUrl(url: string | null | undefined): boolean {
  return !!url && ZERNIO_TEMP_HOST_RE.test(url);
}

export interface SchedulerMediaMuxRow {
  id: string;
  late_media_url: string | null;
  mime_type: string | null;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}

/**
 * Ensure a `scheduler_media` row's video is mirrored on Mux and return the
 * `capped-1080p.mp4` URL when it's ready. Idempotent — a second call after
 * Mux flipped the rendition will short-circuit on the stamped playback id +
 * cached late_media_url.
 *
 * Throws "Mux ingestion in flight" while Mux is still packaging — callers
 * (the publish cron) should treat this like the existing "MP4 not ready"
 * path and retry on the next tick. We don't block the cron loop on it.
 *
 * Only meant for SCHEDULER_MEDIA video rows whose `late_media_url` points at
 * Zernio's `/temp/` CDN. That's the URL surface that TTLs out mid IG
 * container creation for big files. URLs already on Mux, Supabase storage,
 * or any other host are left alone.
 */
export async function ensureMuxForSchedulerMedia(
  admin: SupabaseClient,
  row: SchedulerMediaMuxRow,
): Promise<{ ready: boolean; mp4Url?: string }> {
  if (row.mux_status === 'errored') {
    throw new Error('Mux asset errored. Re-upload the video before retrying.');
  }

  // Asset already finished + late_media_url already swapped to the Mux URL.
  if (
    row.mux_playback_id &&
    row.late_media_url &&
    row.late_media_url.startsWith('https://stream.mux.com/')
  ) {
    return { ready: true, mp4Url: row.late_media_url };
  }

  // We've started Mux ingest before but the rendition isn't ready yet.
  // Probe the asset state and swap URLs when it lands. Webhooks miss
  // occasionally; this pull-mode reconcile catches those rows.
  if (row.mux_asset_id) {
    const mux = getMux();
    const asset = await mux.video.assets.retrieve(row.mux_asset_id);
    if (asset.status === 'errored') {
      await admin
        .from('scheduler_media')
        .update({ mux_status: 'errored' })
        .eq('id', row.id);
      throw new Error('Mux asset errored. Re-upload the video before retrying.');
    }
    const playback = asset.playback_ids?.find((p) => p.policy === 'public');
    const playbackId = playback?.id ?? row.mux_playback_id ?? null;
    const renditions = asset.static_renditions as
      | { status?: string; files?: Array<{ name?: string; ext?: string }> }
      | undefined;
    const renditionReady =
      renditions?.status === 'ready' &&
      !!renditions.files?.some((f) => f.name === 'capped-1080p.mp4');
    if (asset.status === 'ready' && renditionReady && playbackId) {
      const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`;
      await admin
        .from('scheduler_media')
        .update({
          mux_playback_id: playbackId,
          mux_status: 'ready',
          late_media_url: mp4Url,
        })
        .eq('id', row.id);
      return { ready: true, mp4Url };
    }
    return { ready: false };
  }

  // First-time ingest. URL-pull from the still-alive Zernio temp URL.
  if (!row.late_media_url) {
    throw new Error('scheduler_media row has no source URL to ingest into Mux');
  }
  const mux = getMux();
  const asset = await mux.video.assets.create({
    inputs: [{ url: row.late_media_url }],
    playback_policies: ['public'],
    mp4_support: 'capped-1080p',
    video_quality: 'basic',
  });
  const playback = asset.playback_ids?.find((p) => p.policy === 'public');
  await admin
    .from('scheduler_media')
    .update({
      mux_asset_id: asset.id,
      mux_playback_id: playback?.id ?? null,
      mux_status: 'processing',
    })
    .eq('id', row.id);
  return { ready: false };
}
