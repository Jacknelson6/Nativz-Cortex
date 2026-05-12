import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadDriveVideo } from './drive-folder';
import { uploadVideoBytes, uploadThumbnail } from './storage-upload';
import { extractFirstFrame } from './thumbnail';
import { compressVideoIfOversize } from './compress-video';

const CONCURRENCY = 3;

interface IngestRow {
  id: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  mime_type: string | null;
  video_url: string | null;
}

// Two ingest paths share this function:
//   - Drive drops: row has `drive_file_id`. We download from Drive,
//     compress if oversized, upload to scheduler-media, extract a
//     thumbnail.
//   - Direct uploads: row was created with `video_url` already populated
//     by /finalize after the browser PUT'd bytes to a signed Storage URL.
//     We skip download + compression entirely; only the thumbnail step
//     runs server-side (pulled from the supabase-hosted MP4 via fetch).
// Both end states are identical from the analysis pipeline's POV: the
// row sits at `status='analyzing'` with `video_url` + `thumbnail_url`
// set, ready for analyzeDropVideos to pick up.
export async function ingestDrop(
  admin: SupabaseClient,
  opts: { dropId: string; userId: string },
): Promise<{ processed: number; failed: number }> {
  const { data: rows, error } = await admin
    .from('content_drop_videos')
    .select('id, drive_file_id, drive_file_name, mime_type, video_url')
    .eq('drop_id', opts.dropId)
    .eq('status', 'pending')
    .order('order_index');

  if (error) throw new Error(error.message);
  const queue: IngestRow[] = rows ?? [];
  let processed = 0;
  let failed = 0;

  async function ingestDriveRow(row: IngestRow) {
    if (!row.drive_file_id) throw new Error('Drive ingest called on a row with no drive_file_id');
    if (!row.drive_file_name) throw new Error('Drive ingest called on a row with no drive_file_name');
    await admin.from('content_drop_videos').update({ status: 'downloading' }).eq('id', row.id);
    const dl = await downloadDriveVideo(opts.userId, row.drive_file_id);
    const sourceExt = (row.drive_file_name.split('.').pop() ?? 'mp4').toLowerCase();
    const c = await compressVideoIfOversize(dl.buffer, sourceExt);
    const videoUrl = await uploadVideoBytes(admin, {
      dropId: opts.dropId,
      videoId: row.id,
      buffer: c.buffer,
      mimeType: c.mimeType,
      ext: c.ext,
    });
    let thumbUrl: string | null = null;
    try {
      const frame = await extractFirstFrame(c.buffer, c.ext);
      thumbUrl = await uploadThumbnail(admin, {
        dropId: opts.dropId,
        videoId: row.id,
        buffer: frame,
      });
    } catch (err) {
      // Thumbnail failure is non-fatal — admin UI will fall back to video
      // poster, and `scripts/backfill-cover-images.ts` can rescue later.
      // We log loudly because a silent swallow was the root cause of the
      // College Hunks share-page placeholder-icon bug: 15 videos went out
      // with no thumbnail and we had no breadcrumb until the team noticed.
      console.error(
        `[ingest-drop] thumbnail extraction failed (drive) for video ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await admin
      .from('content_drop_videos')
      .update({
        status: 'analyzing',
        video_url: videoUrl,
        thumbnail_url: thumbUrl,
        mime_type: c.mimeType,
        size_bytes: c.finalSize,
      })
      .eq('id', row.id);
  }

  async function ingestDirectUploadRow(row: IngestRow) {
    if (!row.video_url) {
      // /finalize should have set this. If it didn't, the upload never
      // completed (or the row hasn't been finalized yet); fail loudly so
      // the user retries instead of getting a silent caption with no
      // playable media.
      throw new Error('Direct upload row missing video_url — finalize likely never ran');
    }
    await admin.from('content_drop_videos').update({ status: 'downloading' }).eq('id', row.id);
    let thumbUrl: string | null = null;
    try {
      const sourceExt = (row.video_url.split('.').pop() ?? 'mp4').toLowerCase();
      const res = await fetch(row.video_url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const frame = await extractFirstFrame(buf, sourceExt);
        thumbUrl = await uploadThumbnail(admin, {
          dropId: opts.dropId,
          videoId: row.id,
          buffer: frame,
        });
      }
    } catch (err) {
      // Same as Drive path — thumbnail is best-effort. The admin UI will
      // fall back to the <video> element's first-frame poster, and
      // `scripts/backfill-cover-images.ts` can rescue later.
      console.error(
        `[ingest-drop] thumbnail extraction failed (direct) for video ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await admin
      .from('content_drop_videos')
      .update({
        status: 'analyzing',
        // video_url already set by /finalize. Stamp thumbnail.
        thumbnail_url: thumbUrl,
      })
      .eq('id', row.id);
  }

  async function worker(items: IngestRow[]) {
    for (const row of items) {
      try {
        if (row.drive_file_id) {
          await ingestDriveRow(row);
        } else {
          await ingestDirectUploadRow(row);
        }
        processed += 1;
        await admin
          .from('content_drops')
          .update({ processed_videos: processed, updated_at: new Date().toISOString() })
          .eq('id', opts.dropId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown ingestion error';
        failed += 1;
        await admin
          .from('content_drop_videos')
          .update({ status: 'failed', error_detail: message })
          .eq('id', row.id);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, idx) =>
    worker(queue.filter((_, i) => i % CONCURRENCY === idx)),
  );
  await Promise.all(workers);

  return { processed, failed };
}
