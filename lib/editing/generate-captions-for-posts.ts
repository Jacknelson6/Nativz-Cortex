import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyCaptionBoilerplate,
  generateOneCaption,
  type CaptionClientContext,
  type CaptionSavedExample,
} from '@/lib/calendar/generate-caption';
import type { VideoContext } from '@/lib/types/calendar';

const CAPTION_CONCURRENCY = 2;

/**
 * Thumbnail-only captioning for scheduled_posts minted by the
 * "Promote to calendar" action. Skips transcription (no buffer download)
 * and lets `generateOneCaption` infer the hook from the Mux thumbnail —
 * good enough as a starting draft Jack edits inside the calendar.
 *
 * Writes caption + hashtags directly onto scheduled_posts.
 */
export async function generateCaptionsForScheduledPosts(
  admin: SupabaseClient,
  opts: { postIds: string[]; clientId: string; userId: string; userEmail?: string },
): Promise<{ generated: number; failed: number }> {
  if (opts.postIds.length === 0) return { generated: 0, failed: 0 };

  const [{ data: posts }, { data: client }, { data: saved }] = await Promise.all([
    admin
      .from('scheduled_posts')
      .select(
        `id,
         scheduled_post_media!inner(
           media:scheduler_media!inner(thumbnail_url)
         )`,
      )
      .in('id', opts.postIds),
    admin
      .from('clients')
      .select(
        'name, industry, brand_voice, target_audience, topic_keywords, description, services, caption_cta, caption_hashtags, caption_cta_es, caption_hashtags_es, caption_notes, hashtag_notes, cta_notes',
      )
      .eq('id', opts.clientId)
      .single(),
    admin
      .from('saved_captions')
      .select('title, caption_text, hashtags')
      .eq('client_id', opts.clientId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  type MediaSide = { thumbnail_url: string | null } | { thumbnail_url: string | null }[] | null;
  type LinkRow = { media: MediaSide } | null;
  type PostRow = {
    id: string;
    scheduled_post_media: LinkRow | LinkRow[] | null;
  };
  const rows = (posts ?? []) as unknown as PostRow[];
  let generated = 0;
  let failed = 0;

  function thumbFor(row: PostRow): string | null {
    const links: LinkRow[] = Array.isArray(row.scheduled_post_media)
      ? row.scheduled_post_media
      : row.scheduled_post_media
        ? [row.scheduled_post_media]
        : [];
    for (const link of links) {
      const mediaSide = link?.media ?? null;
      const media = Array.isArray(mediaSide) ? mediaSide[0] : mediaSide;
      if (media?.thumbnail_url) return media.thumbnail_url;
    }
    return null;
  }

  async function captionOne(row: PostRow) {
    const thumbnailUrl = thumbFor(row);
    const context: VideoContext = {
      transcript: '',
      language: 'en',
      has_audio: false,
    };
    try {
      const body = await generateOneCaption({
        context,
        thumbnailUrl,
        client: (client ?? null) as CaptionClientContext | null,
        saved: (saved ?? []) as CaptionSavedExample[],
        userId: opts.userId,
        userEmail: opts.userEmail,
      });
      const final = applyCaptionBoilerplate(
        body,
        (client ?? null) as CaptionClientContext | null,
        'en',
      );
      await admin
        .from('scheduled_posts')
        .update({ caption: final.caption, hashtags: final.hashtags })
        .eq('id', row.id);
      generated += 1;
    } catch {
      failed += 1;
    }
  }

  const workers = Array.from(
    { length: Math.min(CAPTION_CONCURRENCY, rows.length) },
    (_, idx) =>
      (async () => {
        for (let i = idx; i < rows.length; i += CAPTION_CONCURRENCY) {
          await captionOne(rows[i]);
        }
      })(),
  );
  await Promise.all(workers);

  return { generated, failed };
}
