import type { SupabaseClient } from '@supabase/supabase-js';
import { transcribeVideo } from './transcribe-video';
import { generateDropCaptions } from './generate-caption';

/**
 * Pull the capped-1080p MP4 from Mux, transcribe it with Whisper, and kick off
 * caption generation for the row. Used by the public-share "+ Add new video"
 * flow where the only copy of the file is the one the editor just dropped into
 * the browser — we can't re-download from Drive like the bulk pipeline does, so
 * we round-trip through Mux's static rendition.
 *
 * Requires:
 *   - row.mux_playback_id is set (asset.ready has fired)
 *   - row.revised_mp4_url is set OR Mux has produced the capped-1080p rendition
 *     under https://stream.mux.com/${playback_id}/capped-1080p.mp4
 *     (static_renditions.ready has fired)
 *
 * On success the row lands at status='ready' with draft_caption + draft_hashtags
 * filled. On any failure status='failed' with error_detail populated. Caller is
 * a webhook handler or a poller, so don't throw — record the failure and let
 * the UI surface it.
 */
export async function analyzeAndCaptionFromMux(
  admin: SupabaseClient,
  opts: { videoId: string; userId: string },
): Promise<{ ok: boolean; reason?: string }> {
  const { data: row } = await admin
    .from('content_drop_videos')
    .select(
      'id, drop_id, mux_playback_id, revised_mp4_url, status, thumbnail_url',
    )
    .eq('id', opts.videoId)
    .single<{
      id: string;
      drop_id: string;
      mux_playback_id: string | null;
      revised_mp4_url: string | null;
      status: string;
      thumbnail_url: string | null;
    }>();
  if (!row) return { ok: false, reason: 'row not found' };

  const mp4Url =
    row.revised_mp4_url ??
    (row.mux_playback_id
      ? `https://stream.mux.com/${row.mux_playback_id}/capped-1080p.mp4`
      : null);
  if (!mp4Url) return { ok: false, reason: 'mp4 not ready' };

  // Stamp 'analyzing' so the share-page poller can render a "generating
  // caption..." chip while we work. Caller (webhook) is best-effort fire-
  // and-forget; the poller is what surfaces progress to the editor.
  await admin
    .from('content_drop_videos')
    .update({ status: 'analyzing' })
    .eq('id', row.id);

  // Stamp a Mux thumbnail if we don't have one yet so the share-page card
  // can show something while caption gen finishes. Mux serves these as
  // public JPEGs with no signing required.
  if (!row.thumbnail_url && row.mux_playback_id) {
    await admin
      .from('content_drop_videos')
      .update({
        thumbnail_url: `https://image.mux.com/${row.mux_playback_id}/thumbnail.jpg?time=1`,
      })
      .eq('id', row.id);
  }

  let buffer: Buffer;
  try {
    const res = await fetch(mp4Url);
    if (!res.ok) {
      throw new Error(`Mux MP4 fetch ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    buffer = Buffer.from(arr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'mp4 download failed';
    await admin
      .from('content_drop_videos')
      .update({ status: 'failed', error_detail: msg })
      .eq('id', row.id);
    return { ok: false, reason: msg };
  }

  try {
    const context = await transcribeVideo({
      buffer,
      ext: 'mp4',
    });
    await admin
      .from('content_drop_videos')
      .update({
        gemini_context: context,
        language: context.language,
        status: 'caption_pending',
      })
      .eq('id', row.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'transcription failed';
    await admin
      .from('content_drop_videos')
      .update({ status: 'failed', error_detail: msg })
      .eq('id', row.id);
    return { ok: false, reason: msg };
  }

  // Look up the drop's client so we can hand the right client_id to the
  // caption generator (brand voice + saved caption examples).
  const { data: drop } = await admin
    .from('content_drops')
    .select('client_id')
    .eq('id', row.drop_id)
    .single<{ client_id: string }>();
  if (!drop) {
    await admin
      .from('content_drop_videos')
      .update({ status: 'failed', error_detail: 'drop missing' })
      .eq('id', row.id);
    return { ok: false, reason: 'drop missing' };
  }

  try {
    // generateDropCaptions sweeps every caption_pending row in the drop.
    // For the +Add flow there's only one such row (this new one) so the
    // wider sweep is effectively a no-op — but we still benefit from the
    // shared brand-context + boilerplate pipeline this way.
    await generateDropCaptions(admin, {
      dropId: row.drop_id,
      clientId: drop.client_id,
      userId: opts.userId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'caption generation failed';
    await admin
      .from('content_drop_videos')
      .update({ status: 'failed', error_detail: msg })
      .eq('id', row.id);
    return { ok: false, reason: msg };
  }

  return { ok: true };
}
