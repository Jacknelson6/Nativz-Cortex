import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  source: z.string().default('all'),
  time_range: z.string().default('last_3_months'),
  language: z.string().default('all'),
  country: z.string().default('us'),
  client_id: z.string().uuid().nullable().optional(),
  search_mode: z.enum(['general', 'client_strategy']).default('general'),
});

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

    const { query, source, time_range, language, country, client_id, search_mode } = parsed.data;

    const adminClient = createAdminClient();

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
        status: 'processing',
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

    return NextResponse.json({ id: search.id });
  } catch (error) {
    console.error('POST /api/search/start error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
