import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadDriveVideo } from './drive-folder';
import { uploadVideoBytes, uploadThumbnail } from './storage-upload';
import { extractFirstFrame } from './thumbnail';

const CONCURRENCY = 3;

interface IngestRow {
  id: string;
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string | null;
}

export async function ingestDrop(
  admin: SupabaseClient,
  opts: { dropId: string; userId: string },
): Promise<{ processed: number; failed: number }> {
  const { data: rows, error } = await admin
    .from('content_drop_videos')
    .select('id, drive_file_id, drive_file_name, mime_type')
    .eq('drop_id', opts.dropId)
    .eq('status', 'pending')
    .order('order_index');

  if (error) throw new Error(error.message);
  const queue: IngestRow[] = rows ?? [];
  let processed = 0;
  let failed = 0;

  async function worker(items: IngestRow[]) {
    for (const row of items) {
      try {
        await admin.from('content_drop_videos').update({ status: 'downloading' }).eq('id', row.id);
        const dl = await downloadDriveVideo(opts.userId, row.drive_file_id);
        const ext = (row.drive_file_name.split('.').pop() ?? 'mp4').toLowerCase();
        const videoUrl = await uploadVideoBytes(admin, {
          dropId: opts.dropId,
          videoId: row.id,
          buffer: dl.buffer,
          mimeType: dl.mimeType,
          ext,
        });
        let thumbUrl: string | null = null;
        try {
          const frame = await extractFirstFrame(dl.buffer, ext);
          thumbUrl = await uploadThumbnail(admin, {
            dropId: opts.dropId,
            videoId: row.id,
            buffer: frame,
          });
        } catch {
          // Thumbnail failure is non-fatal — admin UI will fall back to video poster.
        }
        await admin
          .from('content_drop_videos')
          .update({
            status: 'analyzing',
            video_url: videoUrl,
            thumbnail_url: thumbUrl,
            mime_type: dl.mimeType,
            size_bytes: dl.size,
          })
          .eq('id', row.id);
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
