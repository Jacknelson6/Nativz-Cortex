import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';
import { gradeCaption } from './grade-caption';
import type { CaptionGrade, GeminiContext } from '@/lib/types/calendar';

const SCORE_THRESHOLD = 80;
const MAX_ITERATIONS = 3;
const GENERATION_CONCURRENCY = 2;

interface VideoRow {
  id: string;
  drop_id: string;
  drive_file_name: string;
  gemini_context: GeminiContext | null;
}

interface ClientContext {
  name: string | null;
  industry: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  topic_keywords: string[] | null;
  description: string | null;
  services: string[] | null;
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
      .select('id, drop_id, drive_file_name, gemini_context')
      .eq('drop_id', opts.dropId)
      .eq('status', 'caption_pending')
      .order('order_index'),
    admin
      .from('clients')
      .select('name, industry, brand_voice, target_audience, topic_keywords, description, services')
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

    let bestCaption: { caption: string; hashtags: string[] } | null = null;
    let bestGrade: CaptionGrade | null = null;
    let lastReasons: string[] = [];
    let iterations = 0;
    let lastError: string | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      iterations = i + 1;
      try {
        const result = await generateOneCaption({
          context: row.gemini_context,
          client: client as ClientContext | null,
          saved: (saved ?? []) as SavedCaption[],
          previousAttempt: bestCaption,
          previousReasons: lastReasons,
          previousScore: bestGrade?.total ?? null,
          userId: opts.userId,
          userEmail: opts.userEmail,
        });

        const grade = gradeCaption({
          caption: result.caption,
          hashtags: result.hashtags,
          context: row.gemini_context,
          brandVoice: client?.brand_voice ?? '',
          brandKeywords: collectBrandKeywords(client as ClientContext | null),
          savedCaptions: (saved ?? []).map((s) => ({
            caption_text: s.caption_text,
            hashtags: s.hashtags,
          })),
        });

        if (!bestGrade || grade.total > bestGrade.total) {
          bestCaption = result;
          bestGrade = grade;
        }
        lastReasons = grade.reasons;

        if (grade.total >= SCORE_THRESHOLD) break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Caption generation failed';
        break;
      }
    }

    if (!bestCaption || !bestGrade) {
      await admin
        .from('content_drop_videos')
        .update({
          status: 'failed',
          error_detail: lastError ?? 'Caption generation produced no result',
          caption_iterations: iterations,
        })
        .eq('id', row.id);
      failed += 1;
      return;
    }

    await admin
      .from('content_drop_videos')
      .update({
        draft_caption: bestCaption.caption,
        draft_hashtags: bestCaption.hashtags,
        caption_score: bestGrade.total,
        caption_iterations: iterations,
        status: 'ready',
        error_detail: null,
      })
      .eq('id', row.id);
    generated += 1;
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
  context: GeminiContext;
  client: ClientContext | null;
  saved: SavedCaption[];
  previousAttempt: { caption: string; hashtags: string[] } | null;
  previousReasons: string[];
  previousScore: number | null;
  userId: string;
  userEmail?: string;
}

async function generateOneCaption(
  opts: GenerateOptions,
): Promise<{ caption: string; hashtags: string[] }> {
  const brandBlock = renderBrandBlock(opts.client);
  const savedBlock = renderSavedBlock(opts.saved);
  const videoBlock = renderVideoBlock(opts.context);
  const feedbackBlock =
    opts.previousAttempt && opts.previousScore !== null
      ? renderFeedbackBlock(opts.previousAttempt, opts.previousReasons, opts.previousScore)
      : '';

  const system = `You are a senior short-form video copywriter for Instagram Reels, TikTok, and YouTube Shorts. You write captions that drive comments, saves, and shares.

Output rules:
- Return ONLY valid JSON: { "caption": string, "hashtags": string[] }
- Caption: 80-280 characters, sentence-case, no markdown, no leading hashtags
- Caption opens with a hook line, then a blank line, then a CTA-flavoured closing block
- Hashtags: 3-12 entries, lowercase, no leading "#" — match video themes and brand keywords
- Match the brand voice and align with saved CTAs
- Never use markdown formatting (no asterisks, headers, horizontal rules, backticks)

${brandBlock}${savedBlock}${videoBlock}${feedbackBlock}`;

  const result = await createCompletion({
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          'Write the caption + hashtags for this video. Lead with the recommended caption angle.',
      },
    ],
    maxTokens: 600,
    feature: 'calendar_caption_generate',
    userId: opts.userId,
    userEmail: opts.userEmail,
    jsonMode: true,
  });

  const parsed = parseCaptionJson(result.text);
  return parsed;
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
  return `\nClient context:\n${lines.join('\n')}\n`;
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
  return `\nSaved CTAs & hashtag sets (use as reference for tone, CTAs, and hashtags):\n${examples}\n`;
}

function renderVideoBlock(context: GeminiContext): string {
  const moments = context.key_moments
    .slice(0, 5)
    .map((m) => `  - t=${m.t}s: ${m.description}`)
    .join('\n');
  return `\nVideo context:
- One-liner: ${context.one_liner}
- Hook (0-3s): ${context.hook_seconds_0_3}
- Recommended caption angle: ${context.recommended_caption_angle}
- Visual themes: ${context.visual_themes.join(', ')}
- Mood: ${context.mood} | Pacing: ${context.pacing}
- Audio: ${context.audio_summary}
${context.spoken_text_summary ? `- Spoken text: ${context.spoken_text_summary}` : ''}
- Key moments:\n${moments}\n`;
}

function renderFeedbackBlock(
  previous: { caption: string; hashtags: string[] },
  reasons: string[],
  score: number,
): string {
  return `\nPrevious attempt scored ${score}/100. Issues to fix:
${reasons.map((r) => `- ${r}`).join('\n')}

Previous caption:
${previous.caption}

Previous hashtags: ${previous.hashtags.map((t) => `#${t}`).join(' ')}\n`;
}

function collectBrandKeywords(client: ClientContext | null): string[] {
  if (!client) return [];
  const out: string[] = [];
  if (client.topic_keywords?.length) out.push(...client.topic_keywords);
  if (client.services?.length) out.push(...client.services);
  if (client.name) out.push(client.name);
  return out;
}
