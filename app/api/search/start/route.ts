import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertViewerCanCreateSearchForClient } from '@/lib/api/topic-search-access';

const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  source: z.string().default('all'),
  time_range: z.string().default('last_3_months'),
  language: z.string().default('all'),
  country: z.string().default('us'),
  client_id: z.string().uuid().nullable().optional(),
  search_mode: z.enum(['general', 'client_strategy']).default('general'),
  platforms: z.array(z.enum(['web', 'reddit', 'youtube', 'tiktok', 'quora'])).default(['web']),
  volume: z.enum(['light', 'medium', 'deep', 'quick']).default('medium'),
});

/**
 * POST /api/search/start
 *
 * Create a new topic search record with status 'processing' and return its ID immediately,
 * without running the AI pipeline. Intended for streaming/async UX patterns where the
 * actual search processing is triggered separately via /api/search/[id]/process.
 *
 * @auth Required (any authenticated user)
 * @body query - Search query string (required, max 500 chars)
 * @body source - Content source filter (default: 'all')
 * @body time_range - Time range filter (default: 'last_3_months')
 * @body language - Language filter (default: 'all')
 * @body country - Country filter (default: 'us')
 * @body client_id - Optional client UUID
 * @body search_mode - Search mode ('general' | 'client_strategy', default: 'general')
 * @returns {{ id: string }} UUID of the newly created search record
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, source, time_range, language, country, client_id, search_mode, platforms, volume } = parsed.data;
    const adminClient = createAdminClient();

    const clientCheck = await assertViewerCanCreateSearchForClient(adminClient, user.id, client_id);
    if (!clientCheck.ok) {
      return NextResponse.json(
        { error: clientCheck.error },
        { status: clientCheck.status },
      );
    }

    const { data: search, error: insertError } = await adminClient
      .from('topic_searches')
      .insert({
        query,
        source,
        time_range,
        language,
        country,
        client_id: client_id || null,
        search_mode,
        platforms,
        volume,
        search_version: 3,
        topic_pipeline: 'llm_v1',
        status: 'pending_subtopics',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !search) {
      console.error('Error creating search record:', insertError);
      return NextResponse.json(
        { error: 'Failed to create search', details: insertError?.message || 'No data returned' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: search.id, topic_pipeline: 'llm_v1' });
  } catch (error) {
    console.error('POST /api/search/start error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
