import type { SupabaseClient } from '@supabase/supabase-js';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import type { VideoContext } from '@/lib/types/calendar';

const GENERATION_CONCURRENCY = 2;

interface VideoRow {
  id: string;
  drop_id: string;
  drive_file_name: string;
  thumbnail_url: string | null;
  gemini_context: VideoContext | null;
}

interface ClientContext {
  name: string | null;
  industry: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  topic_keywords: string[] | null;
  description: string | null;
  services: string[] | null;
  caption_cta: string | null;
  caption_hashtags: string[] | null;
  caption_cta_es: string | null;
  caption_hashtags_es: string[] | null;
}

interface SavedCaption {
  title: string | null;
  caption_text: string;
  hashtags: string[] | null;
}

export async function generateDropCaptions(
  admin: SupabaseClient,
  opts: { dropId: string; clientId: string; userId: string; userEmail?: string },
): Promise<{ generated: number; failed: number }> {
  const [{ data: rows }, { data: client }, { data: saved }] = await Promise.all([
    admin
      .from('content_drop_videos')
      .select('id, drop_id, drive_file_name, thumbnail_url, gemini_context')
      .eq('drop_id', opts.dropId)
      .eq('status', 'caption_pending')
      .order('order_index'),
    admin
      .from('clients')
      .select('name, industry, brand_voice, target_audience, topic_keywords, description, services, caption_cta, caption_hashtags, caption_cta_es, caption_hashtags_es')
      .eq('id', opts.clientId)
      .single(),
    admin
      .from('saved_captions')
      .select('title, caption_text, hashtags')
      .eq('client_id', opts.clientId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const queue: VideoRow[] = rows ?? [];
  let generated = 0;
  let failed = 0;

  async function generateOne(row: VideoRow) {
    if (!row.gemini_context) {
      await admin
        .from('content_drop_videos')
        .update({ status: 'failed', error_detail: 'Missing video context' })
        .eq('id', row.id);
      failed += 1;
      return;
    }

    try {
      const generatedBody = await generateOneCaption({
        context: row.gemini_context,
        thumbnailUrl: row.thumbnail_url,
        client: client as ClientContext | null,
        saved: (saved ?? []) as SavedCaption[],
        userId: opts.userId,
        userEmail: opts.userEmail,
      });
      const result = applyBoilerplate(
        generatedBody,
        client as ClientContext | null,
        row.gemini_context.language,
      );

      await admin
        .from('content_drop_videos')
        .update({
          draft_caption: result.caption,
          draft_hashtags: result.hashtags,
          status: 'ready',
          error_detail: null,
        })
        .eq('id', row.id);
      generated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Caption generation failed';
      failed += 1;
      await admin
        .from('content_drop_videos')
        .update({ status: 'failed', error_detail: message })
        .eq('id', row.id);
    }
  }

  const workers = Array.from(
    { length: Math.min(GENERATION_CONCURRENCY, queue.length) },
    (_, idx) =>
      (async () => {
        for (let i = idx; i < queue.length; i += GENERATION_CONCURRENCY) {
          await generateOne(queue[i]);
        }
      })(),
  );
  await Promise.all(workers);

  return { generated, failed };
}

interface GenerateOptions {
  context: VideoContext;
  thumbnailUrl: string | null;
  client: ClientContext | null;
  saved: SavedCaption[];
  userId: string;
  userEmail?: string;
}

async function generateOneCaption(
  opts: GenerateOptions,
): Promise<{ caption: string; hashtags: string[] }> {
  const brandBlock = renderBrandBlock(opts.client);
  const savedBlock = renderSavedBlock(opts.saved);
  const ctaInfo = renderCtaBoilerplateBlock(opts.client, opts.context.language);
  const transcriptBlock = renderTranscriptBlock(opts.context);

  const langLine =
    opts.context.language === 'es'
      ? 'Write the caption in Spanish, the video is in Spanish.'
      : 'Write the caption in English.';

  const system = `You are a senior short-form video copywriter for Instagram Reels, TikTok, and YouTube Shorts. You write captions that drive comments, saves, and shares.

You are looking at the video's first-frame thumbnail and (if present) its spoken transcript. Read both, then write a caption that lands the hook the viewer just saw.

Output rules:
- Return ONLY valid JSON: { "caption": string, "hashtags": string[] }
- Caption: 60-220 characters. Write ONLY the hook line plus a 1-2 sentence body. Do NOT write a CTA, do NOT write hashtags, do NOT write "follow" or "save" lines. Those are appended automatically downstream.
- Sentence-case, no markdown (no asterisks, headers, backticks), no leading hashtags, no emoji spam
- Never use em-dashes (—) or en-dashes (–). Use commas, periods, or new sentences instead.
- Include exactly one topical emoji in the body (no more, no less). Place it where it lands naturally, not just at the end.
- Hashtags: 3-8 entries that match the video's specific themes (not the brand boilerplate — those are appended automatically). Lowercase, no leading "#".
- Match the brand voice and align with saved-caption examples for tone
- ${langLine}
${brandBlock}${savedBlock}${ctaInfo}${transcriptBlock}`;

  const userContent: Record<string, unknown>[] = [];
  if (opts.thumbnailUrl) {
    userContent.push({ type: 'image_url', image_url: { url: opts.thumbnailUrl } });
  }
  userContent.push({
    type: 'text',
    text: 'Write the caption + hashtags for this video.',
  });

  const result = await createOpenRouterRichCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    maxTokens: 600,
    feature: 'calendar_caption_generate',
    userId: opts.userId,
    userEmail: opts.userEmail,
  });

  return parseCaptionJson(result.text);
}

function parseCaptionJson(raw: string): { caption: string; hashtags: string[] } {
  const text = raw.trim();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Caption response was not JSON');
    json = JSON.parse(match[0]);
  }
  const obj = json as { caption?: unknown; hashtags?: unknown };
  if (typeof obj.caption !== 'string') throw new Error('Caption response missing "caption" string');
  const tags = Array.isArray(obj.hashtags)
    ? obj.hashtags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
    : [];
  return { caption: obj.caption.trim(), hashtags: tags };
}

function renderBrandBlock(client: ClientContext | null): string {
  if (!client) return '';
  const lines = [
    `Brand: ${client.name ?? 'Unnamed brand'}`,
    `Industry: ${client.industry ?? 'General'}`,
    `Brand voice: ${client.brand_voice ?? 'Professional and engaging'}`,
    `Target audience: ${client.target_audience ?? 'General audience'}`,
  ];
  if (client.topic_keywords?.length) lines.push(`Keywords: ${client.topic_keywords.join(', ')}`);
  if (client.description) lines.push(`About: ${client.description}`);
  if (client.services?.length) lines.push(`Services: ${client.services.join(', ')}`);
  return `\n\nClient context:\n${lines.join('\n')}`;
}

function renderSavedBlock(saved: SavedCaption[]): string {
  if (!saved.length) return '';
  const examples = saved
    .map((sc) => {
      const parts = [`- "${sc.title ?? 'Saved caption'}": ${sc.caption_text}`];
      if (sc.hashtags?.length) parts.push(`  Hashtags: ${sc.hashtags.map((h) => `#${h}`).join(' ')}`);
      return parts.join('\n');
    })
    .join('\n');
  return `\n\nSaved caption examples (reference for tone only):\n${examples}`;
}

function renderTranscriptBlock(context: VideoContext): string {
  if (!context.has_audio || !context.transcript) {
    return '\n\nVideo has no spoken audio — write the caption from the thumbnail alone.';
  }
  const truncated = context.transcript.length > 1500
    ? context.transcript.slice(0, 1500) + '…'
    : context.transcript;
  return `\n\nSpoken transcript (language=${context.language}):\n${truncated}`;
}

function renderCtaBoilerplateBlock(client: ClientContext | null, language: string): string {
  if (!client) return '';
  const cta = pickLocalisedCta(client, language);
  const tags = pickLocalisedHashtags(client, language);
  const parts: string[] = [];
  if (cta) {
    parts.push(`The following CTA is appended verbatim after every caption — DO NOT repeat it or write your own CTA:\n"${cta}"`);
  }
  if (tags.length) {
    parts.push(
      `These hashtags are appended automatically after every caption — DO NOT repeat them in your hashtag list:\n${tags.map((h) => `#${h}`).join(' ')}`,
    );
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

function applyBoilerplate(
  generated: { caption: string; hashtags: string[] },
  client: ClientContext | null,
  language: string,
): { caption: string; hashtags: string[] } {
  const cta = pickLocalisedCta(client, language);
  const boilerplateTags = pickLocalisedHashtags(client, language)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);

  const caption = cta
    ? `${generated.caption.trim()}\n\n${cta}`
    : generated.caption.trim();

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...boilerplateTags, ...generated.hashtags]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }

  return { caption, hashtags: merged };
}

// Spanish → use _es columns when populated, otherwise fall back to default.
function pickLocalisedCta(client: ClientContext | null, language: string): string | null {
  if (!client) return null;
  if (language === 'es' && client.caption_cta_es?.trim()) {
    return client.caption_cta_es.trim();
  }
  return client.caption_cta?.trim() || null;
}

function pickLocalisedHashtags(client: ClientContext | null, language: string): string[] {
  if (!client) return [];
  if (language === 'es' && client.caption_hashtags_es?.length) {
    return client.caption_hashtags_es;
  }
  return client.caption_hashtags ?? [];
}
