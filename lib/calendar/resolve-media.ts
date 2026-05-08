import type { SupabaseClient } from '@supabase/supabase-js';
import { reconcileMuxRow, type ReconcileTarget } from '@/lib/mux/reconcile';
import { ensureFeedCompatibleUrl } from '@/lib/calendar/normalize-image-for-feed';
import {
  ensureMuxForSchedulerMedia,
  isZernioTempUrl,
  type SchedulerMediaMuxRow,
} from '@/lib/mux/scheduler-media';

export interface ResolvedMedia {
  videoUrl?: string;
  mediaItems?: { type: 'image' | 'video'; url: string }[];
}

/**
 * Resolve the publish-time media payload for a scheduled_posts row.
 *
 * Mux-aware so revisions ship the rendered MP4, not the snapshot the
 * scheduler grabbed at calendar-build time. Both publish paths (cron's
 * hard-publish loop and `publishScheduledPost`) call into this so the
 * approval-driven path can no longer ship the original video after a
 * revision was uploaded.
 *
 * Priority for video posts:
 *   1. revised_video_uploaded_at set + revised_mp4_url null → throw
 *      (Mux still rendering revision; let caller retry).
 *   2. revised_mp4_url set → use it (Zernio cannot read HLS .m3u8). The Mux
 *      static-renditions webhook stamps this field for ANY asset (originals
 *      AND revisions) once `capped-1080p.mp4` packaging finishes, so this
 *      branch covers both producer Mux ingestion and revision uploads.
 *   3. mux_playback_id set but revised_mp4_url null → throw (original was
 *      ingested into Mux at schedule-time but the capped-1080p rendition
 *      isn't ready yet). Don't guess a URL — the webhook will write the
 *      authoritative one shortly. Cron retry handles the wait.
 *   4. Fall back to scheduler_media.late_media_url snapshot (legacy posts
 *      from before producer Mux ingestion).
 *
 * Image carousels skip Mux logic entirely and use the scheduler_media
 * snapshot in sort_order. Storage paths are public-URL'd lazily in case
 * the row stored a relative key vs. a full URL.
 */
export async function resolveScheduledPostMedia(
  admin: SupabaseClient,
  postId: string,
  postType: string | null,
): Promise<ResolvedMedia> {
  const isImagePost = postType === 'image' || postType === 'carousel';

  if (isImagePost) {
    const { data: links } = await admin
      .from('scheduled_post_media')
      .select(
        'sort_order, scheduler_media:media_id (id, late_media_url, storage_path, mime_type, width, height, feed_normalized_url)',
      )
      .eq('post_id', postId)
      .order('sort_order');

    type MediaRow = {
      id: string;
      late_media_url: string | null;
      storage_path: string | null;
      mime_type: string | null;
      width: number | null;
      height: number | null;
      feed_normalized_url: string | null;
    };
    type LinkRow = {
      sort_order: number | null;
      scheduler_media: MediaRow | MediaRow[] | null;
    };
    const rows = ((links ?? []) as LinkRow[])
      .map((l) => (Array.isArray(l.scheduler_media) ? l.scheduler_media[0] : l.scheduler_media))
      .filter((m): m is MediaRow => !!m && (!!m.late_media_url || !!m.storage_path));

    if (rows.length === 0) throw new Error('No media attached to image post');

    // Normalize each image to Instagram feed-compatible aspect ratio (4:5
    // letterbox with blurred fill) when the source falls outside [0.8, 1.91].
    // Otherwise Zernio silently routes to Stories.
    const urls = await Promise.all(
      rows.map(async (m) => {
        const sourceUrl = resolveStoragePath(admin, (m.late_media_url ?? m.storage_path) as string);
        return ensureFeedCompatibleUrl(admin, {
          id: m.id,
          late_media_url: sourceUrl,
          storage_path: m.storage_path,
          feed_normalized_url: m.feed_normalized_url,
          width: m.width,
          height: m.height,
        });
      }),
    );

    return { mediaItems: urls.map((url) => ({ type: 'image' as const, url })) };
  }

  const { data: revisionRow } = await admin
    .from('content_drop_videos')
    .select('id, revised_mp4_url, revised_video_uploaded_at, mux_playback_id, mux_upload_id, mux_asset_id, mux_status')
    .eq('scheduled_post_id', postId)
    .maybeSingle<{
      id: string;
      revised_mp4_url: string | null;
      revised_video_uploaded_at: string | null;
      mux_playback_id: string | null;
      mux_upload_id: string | null;
      mux_asset_id: string | null;
      mux_status: string | null;
    }>();

  let row = revisionRow;
  const revisionUploaded = row?.revised_video_uploaded_at != null;
  const revisionReady = row?.revised_mp4_url != null;

  // Self-heal: if Mux pipeline state suggests the asset *should* be ready
  // but no URL is stamped, actively probe Mux before giving up. Webhooks
  // miss occasionally — pull-mode reconcile catches those rows so the
  // publish path doesn't sit on retry-loop until someone notices.
  if (row && !revisionReady && (revisionUploaded || row.mux_playback_id || row.mux_asset_id || row.mux_upload_id)) {
    const target: ReconcileTarget = {
      id: row.id,
      mux_upload_id: row.mux_upload_id,
      mux_asset_id: row.mux_asset_id,
      mux_status: row.mux_status,
      revised_mp4_url: row.revised_mp4_url,
    };
    const patch = await reconcileMuxRow(admin, target);
    if (patch?.revised_mp4_url) {
      row = { ...row, revised_mp4_url: patch.revised_mp4_url };
    } else if (patch?.mux_playback_id) {
      row = { ...row, mux_playback_id: patch.mux_playback_id };
    }
  }

  const finalRevisionReady = row?.revised_mp4_url != null;

  // Gap 6/A10: if Mux flipped the asset to `errored`, the rendition is
  // never going to land. The previous code threw "MP4 not ready yet. Cron
  // will retry." for this state too, which means we'd burn 3 retries +
  // a posting health alert before giving up — and the failure_reason
  // surfaced to the user said "not ready yet" instead of "asset broken".
  // Throw a distinct terminal-flavoured error so the catch site stamps a
  // useful reason and operators know they need to re-upload, not wait.
  if (row?.mux_status === 'errored') {
    throw new Error('Mux asset errored — original or revision failed to encode. Re-upload the video before retrying.');
  }

  if (revisionUploaded && !finalRevisionReady) {
    throw new Error('Revision pending: Mux MP4 rendition not ready yet. Cron will retry.');
  }

  if (finalRevisionReady) {
    return { videoUrl: row!.revised_mp4_url as string };
  }

  if (row?.mux_playback_id) {
    // Producer ingested into Mux but the `capped-1080p.mp4` static rendition
    // isn't ready yet. We deliberately do NOT guess a URL here — assets are
    // created with `mp4_support: 'capped-1080p'`, so the only correct path
    // is `capped-1080p.mp4`, and that file 404s until Mux finishes packaging
    // (~1-5 min after ingest). The static_renditions.ready webhook stamps
    // `revised_mp4_url` with the authoritative URL — we retry until then.
    throw new Error('Mux MP4 rendition not ready yet for original. Cron will retry.');
  }

  const { data: links } = await admin
    .from('scheduled_post_media')
    .select(
      'sort_order, scheduler_media:media_id (id, late_media_url, storage_path, mime_type, mux_upload_id, mux_asset_id, mux_playback_id, mux_status)',
    )
    .eq('post_id', postId)
    .order('sort_order')
    .limit(1);

  type SchedulerMediaPick = SchedulerMediaMuxRow & { storage_path: string | null };
  type LinkRow = {
    scheduler_media: SchedulerMediaPick | SchedulerMediaPick[] | null;
  };
  const first = (links ?? [])[0] as LinkRow | undefined;
  const m = first ? (Array.isArray(first.scheduler_media) ? first.scheduler_media[0] : first.scheduler_media) : null;
  const fallback = m?.late_media_url ?? m?.storage_path ?? null;
  if (!m || !fallback) throw new Error('No media attached to post');

  // Self-heal: UI-uploaded videos land on Zernio's temp CDN, which TTLs out
  // mid IG container creation for big files. Mirror onto Mux on first publish
  // attempt; subsequent attempts reuse the stamped Mux asset. The cron retry
  // path naturally absorbs the 1-5 min wait while Mux packages the rendition.
  if (isZernioTempUrl(fallback) && m.mime_type?.startsWith('video/')) {
    const result = await ensureMuxForSchedulerMedia(admin, {
      id: m.id,
      late_media_url: m.late_media_url,
      mime_type: m.mime_type,
      mux_upload_id: m.mux_upload_id,
      mux_asset_id: m.mux_asset_id,
      mux_playback_id: m.mux_playback_id,
      mux_status: m.mux_status,
    });
    if (!result.ready) {
      throw new Error('Mux MP4 rendition not ready yet for original. Cron will retry.');
    }
    return { videoUrl: result.mp4Url! };
  }

  return { videoUrl: resolveStoragePath(admin, fallback) };
}

function resolveStoragePath(admin: SupabaseClient, rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const { data } = admin.storage.from('scheduler-media').getPublicUrl(rawPath);
  return data.publicUrl;
}
