import type { SupabaseClient } from '@supabase/supabase-js';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';

const GENERATION_CONCURRENCY = 2;
const MAX_VISION_IMAGES = 6;

interface PostRow {
  id: string;
  drop_id: string;
  drive_file_name: string;
}

interface AssetRow {
  asset_url: string | null;
  position: number;
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
  // NAT-67: free-text strategist guidance, mirrored from generate-caption.ts
  // so static / carousel posts get the same prompt context as video drops.
  caption_notes: string | null;
  hashtag_notes: string | null;
  cta_notes: string | null;
}

interface SavedCaption {
  title: string | null;
  caption_text: string;
  hashtags: string[] | null;
}

// Vision-only caption generation for image / carousel posts. No transcript,
// no Gemini-extracted context. We give the model the asset URLs directly and
// tell it to write a caption that lands what the viewer is looking at. Brand
// voice + saved-caption examples drive tone. Boilerplate CTA + hashtags get
// appended downstream identically to the video flow.
export async function generateImageDropCaptions(
  admin: SupabaseClient,
  opts: { dropId: string; clientId: string; userId: string; userEmail?: string },
): Promise<{ generated: number; failed: number }> {
  const [{ data: rows }, { data: client }, { data: saved }] = await Promise.all([
    admin
      .from('content_drop_videos')
      .select('id, drop_id, drive_file_name')
      .eq('drop_id', opts.dropId)
      .eq('status', 'caption_pending')
      .order('order_index'),
    admin
      .from('clients')
      .select('name, industry, brand_voice, target_audience, topic_keywords, description, services, caption_cta, caption_hashtags, caption_cta_es, caption_hashtags_es, caption_notes, hashtag_notes, cta_notes')
      .eq('id', opts.clientId)
      .single(),
    admin
      .from('saved_captions')
      .select('title, caption_text, hashtags')
      .eq('client_id', opts.clientId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const queue: PostRow[] = rows ?? [];
  let generated = 0;
  let failed = 0;

  async function generateOne(row: PostRow) {
    try {
      const { data: assets } = await admin
        .from('content_drop_post_assets')
        .select('asset_url, position')
        .eq('drop_video_id', row.id)
        .eq('status', 'ready')
        .order('position', { ascending: true });
      const assetRows: AssetRow[] = (assets ?? []).filter((a) => a.asset_url);
      if (assetRows.length === 0) {
        await admin
          .from('content_drop_videos')
          .update({ status: 'failed', error_detail: 'No ready image assets to caption' })
          .eq('id', row.id);
        failed += 1;
        return;
      }

      const generatedBody = await generateOneCaption({
        assetUrls: assetRows.slice(0, MAX_VISION_IMAGES).map((a) => a.asset_url as string),
        carouselSize: assetRows.length,
        client: client as ClientContext | null,
        saved: (saved ?? []) as SavedCaption[],
        userId: opts.userId,
        userEmail: opts.userEmail,
      });
      const result = applyBoilerplate(generatedBody, client as ClientContext | null);

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
  assetUrls: string[];
  carouselSize: number;
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
  const ctaInfo = renderCtaBoilerplateBlock(opts.client);

  const carouselNote =
    opts.carouselSize > 1
      ? `\n\nThis is a ${opts.carouselSize}-image carousel post. The first image is the cover (what people see in feed). Write the caption to land the cover and tease that there's more inside.`
      : '\n\nThis is a single-image post.';

  const system = `You are a senior short-form social copywriter for Instagram and Facebook. You write captions that drive comments, saves, and shares for static-image posts and carousels.

You are looking at the post's image(s). Read what's actually shown — product, scene, text on image, mood — then write a caption that lands the visual.

Output rules:
- Return ONLY valid JSON: { "caption": string, "hashtags": string[] }
- Caption: 60-220 characters. Write ONLY the hook line plus a 1-2 sentence body. Do NOT write a CTA, do NOT write hashtags, do NOT write "follow" or "save" lines. Those are appended automatically downstream.
- Sentence-case, no markdown (no asterisks, headers, backticks), no leading hashtags, no emoji spam
- Never use em-dashes. Use commas, periods, or new sentences instead.
- Include exactly one topical emoji in the body (no more, no less). Place it where it lands naturally, not just at the end.
- Hashtags: 3-8 entries that match the image's specific themes (not the brand boilerplate, those are appended automatically). Lowercase, no leading "#".
- Match the brand voice and align with saved-caption examples for tone${carouselNote}
${brandBlock}${savedBlock}${ctaInfo}`;

  const userContent: Record<string, unknown>[] = [];
  for (const url of opts.assetUrls) {
    userContent.push({ type: 'image_url', image_url: { url } });
  }
  userContent.push({
    type: 'text',
    text:
      opts.carouselSize > 1
        ? `Write the caption + hashtags for this ${opts.carouselSize}-image carousel.`
        : 'Write the caption + hashtags for this image post.',
  });

  const result = await createOpenRouterRichCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    maxTokens: 600,
    feature: 'calendar_image_caption_generate',
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

  // NAT-67: per-brand strategist guidance — same shape as the video flow
  // in generate-caption.ts. Empty notes stay silent so the prompt doesn't
  // bloat with placeholder headings for brands that haven't filled them in.
  const guidance: string[] = [];
  if (client.caption_notes?.trim()) {
    guidance.push(`Caption guidance:\n${client.caption_notes.trim()}`);
  }
  if (client.hashtag_notes?.trim()) {
    guidance.push(`Hashtag guidance:\n${client.hashtag_notes.trim()}`);
  }
  if (client.cta_notes?.trim()) {
    guidance.push(`CTA guidance:\n${client.cta_notes.trim()}`);
  }
  const guidanceBlock = guidance.length ? `\n\n${guidance.join('\n\n')}` : '';

  return `\n\nClient context:\n${lines.join('\n')}${guidanceBlock}`;
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

function renderCtaBoilerplateBlock(client: ClientContext | null): string {
  if (!client) return '';
  const cta = client.caption_cta?.trim() || null;
  const tags = client.caption_hashtags ?? [];
  const parts: string[] = [];
  if (cta) {
    parts.push(`The following CTA is appended verbatim after every caption, DO NOT repeat it or write your own CTA:\n"${cta}"`);
  }
  if (tags.length) {
    parts.push(
      `These hashtags are appended automatically after every caption, DO NOT repeat them in your hashtag list:\n${tags.map((h) => `#${h}`).join(' ')}`,
    );
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

function applyBoilerplate(
  generated: { caption: string; hashtags: string[] },
  client: ClientContext | null,
): { caption: string; hashtags: string[] } {
  const cta = client?.caption_cta?.trim() || null;
  const boilerplateTags = (client?.caption_hashtags ?? [])
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
