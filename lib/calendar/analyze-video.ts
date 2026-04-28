import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadDriveVideo } from './drive-folder';
import { transcribeVideo } from './transcribe-video';

const ANALYSIS_CONCURRENCY = 2;

interface VideoRow {
  id: string;
  drop_id: string;
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string | null;
}

// Whisper accepts video containers directly (mp4/mov/webm/m4a/mp3/wav). We map
// the Drive mime/filename to one of those so the upload's filename hint matches
// what's in the buffer — Whisper rejects a `.mp4` blob with `audio/mpeg`.
function deriveExt(mime: string | null, filename: string): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('quicktime')) return 'mov';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  const dot = filename.lastIndexOf('.');
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
  return 'mp4';
}

export async function analyzeDropVideos(
  admin: SupabaseClient,
  opts: { dropId: string; userId: string },
): Promise<{ analyzed: number; failed: number }> {
  const { data: rows } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, drive_file_id, drive_file_name, mime_type')
    .eq('drop_id', opts.dropId)
    .eq('status', 'analyzing')
    .order('order_index');

  const queue: VideoRow[] = rows ?? [];
  let analyzed = 0;
  let failed = 0;

  async function analyzeOne(row: VideoRow) {
    try {
      const dl = await downloadDriveVideo(opts.userId, row.drive_file_id);
      const ext = deriveExt(row.mime_type ?? dl.mimeType, row.drive_file_name);
      const context = await transcribeVideo({
        buffer: dl.buffer,
        ext,
        displayName: row.drive_file_name,
      });
      await admin
        .from('content_drop_videos')
        .update({
          status: 'caption_pending',
          gemini_context: context,
          language: context.language,
        })
        .eq('id', row.id);
      analyzed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      failed += 1;
      await admin
        .from('content_drop_videos')
        .update({ status: 'failed', error_detail: message })
        .eq('id', row.id);
    }
  }

  const workers = Array.from(
    { length: Math.min(ANALYSIS_CONCURRENCY, queue.length) },
    (_, idx) =>
      (async () => {
        for (let i = idx; i < queue.length; i += ANALYSIS_CONCURRENCY) {
          await analyzeOne(queue[i]);
        }
      })(),
  );
  await Promise.all(workers);

  return { analyzed, failed };
}
