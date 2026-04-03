import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { PlatformSource, SearchPlatform } from '@/lib/types/search';

export function findPlatformSourceInSearch(
  platformData: unknown,
  platform: SearchPlatform,
  sourceId: string,
): PlatformSource | null {
  const raw = platformData as Record<string, unknown> | null | undefined;
  const sources = raw?.sources;
  if (!Array.isArray(sources)) return null;
  const found = sources.find(
    (s: PlatformSource) => s?.platform === platform && s?.id === sourceId,
  );
  return found ?? null;
}

export interface TopicSourceInsights {
  hook_analysis: string;
  frame_type_breakdown: string;
}

export async function runTopicSourceInsights(
  transcript: string,
  title: string,
  platform: string,
  user: { id: string; email?: string | null },
): Promise<{ ok: true; insights: TopicSourceInsights } | { ok: false; error: string }> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { ok: false, error: 'No transcript available for this source.' };
  }

  const prompt = `Analyze this short-form video source for a content strategist.

Platform: ${platform}
Title: ${title || 'Unknown'}

Transcript (may be truncated):
${trimmed.slice(0, 6000)}

Return ONLY valid JSON with this exact shape (no markdown):
{
  "hook_analysis": "2-4 sentences: what hook pattern is used, why it likely works for this audience, and opening line or beat.",
  "frame_type_breakdown": "Bullet-style lines (use \\n between items): shot types or frame roles you can infer (e.g. talking head, B-roll, text-on-screen, pattern interrupt). If unknown, infer from transcript tone."
}`;

  try {
    const aiResult = await createCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a video content analyst. Return only valid JSON, no code fences.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1200,
      feature: 'topic_source_insights',
      modelPreference: [DEFAULT_OPENROUTER_MODEL],
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const text = aiResult.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'AI returned empty response' };
    }

    const insights = parseAIResponseJSON<TopicSourceInsights>(text);
    if (!insights.hook_analysis || !insights.frame_type_breakdown) {
      return { ok: false, error: 'Invalid insights shape from model' };
    }
    return { ok: true, insights };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analysis failed';
    return { ok: false, error: msg };
  }
}

export interface TopicSourceRescriptOptions {
  source: PlatformSource;
  client_id?: string;
  brand_voice?: string;
  product?: string;
  target_audience?: string;
  notes?: string;
  /** When set, idea titles/context are merged into the prompt */
  ideaContext?: string | null;
}

export async function runTopicSourceRescript(
  adminClient: SupabaseClient,
  options: TopicSourceRescriptOptions,
  user: { id: string; email?: string | null },
): Promise<
  | { ok: true; script: string; rescript: Record<string, unknown> }
  | { ok: false; error: string; status?: number }
> {
  const { source } = options;
  const transcript = (source.transcript ?? '').trim();
  if (!transcript) {
    return { ok: false, error: 'No transcript available to rescript.', status: 400 };
  }

  let clientInfo = '';
  if (options.client_id) {
    const { data: client } = await adminClient
      .from('clients')
      .select('name, industry, target_audience, brand_voice')
      .eq('id', options.client_id)
      .single();

    if (client) {
      clientInfo = `Client: ${client.name}\nIndustry: ${client.industry}\nTarget audience: ${client.target_audience || options.target_audience || 'Not specified'}\nBrand voice: ${client.brand_voice || options.brand_voice || 'Not specified'}`;
    }
  }

  const ideaBlock = options.ideaContext?.trim()
    ? `\nUse this generated idea set as creative direction (angles, titles, pillars):\n${options.ideaContext.slice(0, 4000)}\n`
    : '';

  const prompt = `You are a senior video content strategist adapting viral short-form scripts for brands.

Original source:
- Platform: ${source.platform}
- Title: ${source.title || 'Unknown'}
- URL: ${source.url}
- Transcript:
${transcript.slice(0, 8000)}
${ideaBlock}
${clientInfo ? `${clientInfo}\n` : ''}
${options.brand_voice && !options.client_id ? `Brand voice: ${options.brand_voice}\n` : ''}
${options.product ? `Product/service: ${options.product}\n` : ''}
${options.target_audience && !options.client_id ? `Target audience: ${options.target_audience}\n` : ''}
${options.notes ? `Additional notes: ${options.notes}\n` : ''}

Rescript this for the brand context above. Write ONLY the spoken word script — exact words on camera. Keep pacing and structure similar to the original where it works, but adapt fully to the brand.

Do NOT include shot lists, camera directions, or hashtags.

Return JSON only:
{"script":"..."}`;

  try {
    const aiResult = await createCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a senior video content strategist. Return only valid JSON, no markdown code fences.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 2000,
      feature: 'topic_source_rescript',
      modelPreference: [DEFAULT_OPENROUTER_MODEL],
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const content = aiResult.text || '';
    if (!content) {
      return { ok: false, error: 'AI returned empty response', status: 502 };
    }

    let script: string;
    try {
      const jsonStr = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
      const parsed2 = JSON.parse(jsonStr) as { script?: string };
      script = parsed2.script ?? content;
    } catch {
      script = content;
    }

    const rescriptData = {
      script,
      client_id: options.client_id || undefined,
      generated_at: new Date().toISOString(),
    };

    return { ok: true, script, rescript: rescriptData };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analysis failed';
    return { ok: false, error: msg, status: 500 };
  }
}
