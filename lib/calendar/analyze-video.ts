import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadFileToGemini, waitForGeminiFileActive, generateWithFile } from '@/lib/gemini/file-api';
import { downloadDriveVideo } from './drive-folder';
import type { GeminiContext } from '@/lib/types/calendar';

const ANALYSIS_PROMPT = `You are a senior short-form video strategist. Analyse this short-form vertical video (TikTok/Reels/Shorts) deeply.

Return JSON matching this schema exactly:
- one_liner: single sentence describing the video
- hook_seconds_0_3: literal description of seconds 0-3 (the hook)
- visual_themes: 3-7 short tags ("gym", "kettlebells", "neon lighting")
- audio_summary: music + ambient + voiceover description
- spoken_text_summary: VO/dialogue summary, "" if none
- mood: one word ("energetic", "calm", "playful", etc.)
- pacing: one of "slow" | "medium" | "fast"
- recommended_caption_angle: best angle to lead the caption with (e.g. "lead with the unusual exercise")
- key_moments: 2-5 timestamped beats with t (seconds) and description

Be concrete and specific. The output drives downstream caption generation.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    one_liner: { type: 'STRING' },
    hook_seconds_0_3: { type: 'STRING' },
    visual_themes: { type: 'ARRAY', items: { type: 'STRING' } },
    audio_summary: { type: 'STRING' },
    spoken_text_summary: { type: 'STRING' },
    mood: { type: 'STRING' },
    pacing: { type: 'STRING', enum: ['slow', 'medium', 'fast'] },
    recommended_caption_angle: { type: 'STRING' },
    key_moments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { t: { type: 'NUMBER' }, description: { type: 'STRING' } },
        required: ['t', 'description'],
      },
    },
  },
  required: [
    'one_liner',
    'hook_seconds_0_3',
    'visual_themes',
    'audio_summary',
    'spoken_text_summary',
    'mood',
    'pacing',
    'recommended_caption_angle',
    'key_moments',
  ],
};

const ANALYSIS_CONCURRENCY = 2;

interface VideoRow {
  id: string;
  drop_id: string;
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string | null;
  gemini_file_uri: string | null;
}

export async function analyzeDropVideos(
  admin: SupabaseClient,
  opts: { dropId: string; userId: string },
): Promise<{ analyzed: number; failed: number }> {
  const { data: rows } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, drive_file_id, drive_file_name, mime_type, gemini_file_uri')
    .eq('drop_id', opts.dropId)
    .eq('status', 'analyzing')
    .order('order_index');

  const queue: VideoRow[] = rows ?? [];
  let analyzed = 0;
  let failed = 0;

  async function analyzeOne(row: VideoRow) {
    try {
      let fileUri = row.gemini_file_uri;
      const mimeType = row.mime_type ?? 'video/mp4';
      if (!fileUri) {
        const dl = await downloadDriveVideo(opts.userId, row.drive_file_id);
        const ref = await uploadFileToGemini({
          buffer: dl.buffer,
          mimeType: dl.mimeType,
          displayName: row.drive_file_name,
        });
        await waitForGeminiFileActive(ref.name);
        fileUri = ref.uri;
        await admin
          .from('content_drop_videos')
          .update({ gemini_file_uri: ref.uri })
          .eq('id', row.id);
      }
      const context = await generateWithFile<GeminiContext>({
        fileUri,
        mimeType,
        prompt: ANALYSIS_PROMPT,
        responseSchema: RESPONSE_SCHEMA,
      });
      await admin
        .from('content_drop_videos')
        .update({ status: 'caption_pending', gemini_context: context })
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
