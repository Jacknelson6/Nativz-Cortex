import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  extractExplainContext,
  findEmotionInList,
  generateEmotionExplanation,
} from '@/lib/search/explain-emotion';
import type { EmotionBreakdown } from '@/lib/types/search';

export const maxDuration = 60;

const bodySchema = z.object({
  emotion: z.string().trim().min(1).max(80),
});

/**
 * POST /api/shared/search/[token]/explain-emotion
 *
 * Same as authenticated explain-emotion, scoped to a valid share token.
 *
 * @auth None (public; token must be valid and unexpired)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: link } = await adminClient
      .from('search_share_links')
      .select('search_id, expires_at')
      .eq('token', token)
      .single();

    if (!link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 });
    }

    const { data: search, error: fetchError } = await adminClient
      .from('topic_searches')
      .select('id, query, summary, emotions, raw_ai_response, status')
      .eq('id', link.search_id)
      .eq('status', 'completed')
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    const emotions = (search.emotions ?? []) as EmotionBreakdown[];
    const match = findEmotionInList(emotions, parsed.data.emotion);
    if (!match) {
      return NextResponse.json(
        { error: 'Emotion not found for this search', emotion: parsed.data.emotion },
        { status: 404 },
      );
    }

    const ctx = extractExplainContext(search.raw_ai_response);
    const summary = search.summary ?? '';

    const explanation = await generateEmotionExplanation({
      query: search.query,
      summary,
      emotion: match,
      allEmotions: emotions,
      trendingTopicNames: ctx.trendingTopicNames,
      themeLabels: ctx.themeLabels,
      overallSentiment: ctx.overallSentiment,
      userId: undefined,
      userEmail: undefined,
    });

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('POST /api/shared/search/[token]/explain-emotion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to explain emotion' },
      { status: 500 },
    );
  }
}
