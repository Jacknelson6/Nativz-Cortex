import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';
import { findPlatformSourceInSearch } from '@/lib/search/topic-source-ai';
import { runTopicSearchSourceTranscribe } from '@/lib/search/topic-search-source-transcribe';
import type { SearchPlatform } from '@/lib/types/search';

export const maxDuration = 120;

const bodySchema = z.object({
  platform: z.enum(['reddit', 'youtube', 'tiktok', 'web', 'quora']),
  source_id: z.string().min(1),
});

/**
 * POST /api/search/[id]/sources/transcribe
 *
 * Fetch transcript (+ segments for TikTok) for a topic-search video source and persist on the search row.
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

    const admin = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(admin, user.id, searchId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search as { id: string; platform_data: unknown };

    const source = findPlatformSourceInSearch(
      search.platform_data,
      platform as SearchPlatform,
      source_id,
    );
    if (!source) {
      return NextResponse.json({ error: 'Source not found on this search' }, { status: 404 });
    }

    const result = await runTopicSearchSourceTranscribe(
      admin,
      searchId,
      platform as SearchPlatform,
      source_id,
      source,
      user,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json({ source: result.source });
  } catch (error) {
    console.error('POST /api/search/[id]/sources/transcribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
