import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
 * POST /api/search/[id]/explain-emotion
 *
 * AI explanation for why a given emotion appears in the research mix.
 *
 * @auth Required (signed-in user)
 * @body emotion — Must match an emotion label from this search’s emotions array
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const { data: search, error: fetchError } = await adminClient
      .from('topic_searches')
      .select('id, query, summary, emotions, raw_ai_response, status')
      .eq('id', id)
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if (search.status !== 'completed') {
      return NextResponse.json({ error: 'Search is not completed yet' }, { status: 400 });
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
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('POST /api/search/[id]/explain-emotion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to explain emotion' },
      { status: 500 },
    );
  }
}
