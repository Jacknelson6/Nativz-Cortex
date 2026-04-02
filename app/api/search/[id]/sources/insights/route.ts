import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  findPlatformSourceInSearch,
  runTopicSourceInsights,
} from '@/lib/search/topic-source-ai';
import type { SearchPlatform } from '@/lib/types/search';

export const maxDuration = 60;

const bodySchema = z.object({
  platform: z.enum(['reddit', 'youtube', 'tiktok', 'web', 'quora']),
  source_id: z.string().min(1),
});

/**
 * POST /api/search/[id]/sources/insights
 *
 * AI hook + frame breakdown for a platform source (uses transcript).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: searchId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { platform, source_id } = parsed.data;

    const { data: search, error: fetchError } = await supabase
      .from('topic_searches')
      .select('id, platform_data')
      .eq('id', searchId)
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    const source = findPlatformSourceInSearch(
      search.platform_data,
      platform as SearchPlatform,
      source_id,
    );
    if (!source) {
      return NextResponse.json({ error: 'Source not found on this search' }, { status: 404 });
    }

    const result = await runTopicSourceInsights(
      source.transcript ?? '',
      source.title,
      source.platform,
      user,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ insights: result.insights });
  } catch (error) {
    console.error('POST /api/search/[id]/sources/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
