import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

export const maxDuration = 60;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

const responseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      short: z.string(),
    }),
  ),
});

const HISTORY_TITLE_MAX = 50;

function mechanicalShort(title: string, max = HISTORY_TITLE_MAX): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * POST /api/history/shorten-titles
 *
 * Batch-shorten long history titles for the UI (max 50 characters each) via LLM.
 * Falls back to mechanical truncation for any id the model omits.
 *
 * @auth Required
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const needShort = parsed.data.items.filter((i) => i.title.trim().length > HISTORY_TITLE_MAX);
    if (needShort.length === 0) {
      return NextResponse.json({ shorts: {} as Record<string, string> });
    }

    const payload = needShort.map((i) => ({
      id: i.id,
      title: i.title.trim().slice(0, 500),
    }));

    const prompt = `You shorten dashboard history titles. Each "short" must be at most 50 characters (count all characters including spaces and punctuation). Keep the core meaning: topic, brand, or intent.

Return ONLY valid JSON:
{"items":[{"id":"string","short":"string"}]}

Include one object per input id. Do not omit ids.

Input:
${JSON.stringify(payload)}`;

    const ai = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1400,
      feature: 'history_title_shortening',
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    let items: { id: string; short: string }[] = [];
    try {
      const raw = parseAIResponseJSON<unknown>(ai.text);
      const validated = responseSchema.safeParse(raw);
      if (validated.success) {
        items = validated.data.items;
      } else {
        console.warn('[shorten-titles] schema mismatch', raw);
      }
    } catch (e) {
      console.warn('[shorten-titles] parse failed', e);
    }

    const shorts: Record<string, string> = {};
    const byId = new Map(needShort.map((i) => [i.id, i.title]));
    for (const row of items) {
      const title = byId.get(row.id);
      if (!title) continue;
      const t = row.short.trim().slice(0, HISTORY_TITLE_MAX);
      if (t) shorts[row.id] = t;
    }
    for (const i of needShort) {
      if (!shorts[i.id]) {
        shorts[i.id] = mechanicalShort(i.title);
      }
    }

    return NextResponse.json({ shorts });
  } catch (error) {
    console.error('POST /api/history/shorten-titles', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
