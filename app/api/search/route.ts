import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSchema, executeTopicSearch } from '@/lib/search/execute-topic-search';

export const maxDuration = 300;

/**
 * POST /api/search
 *
 * Execute a full AI-powered topic research search. Gathers SERP data from SearXNG,
 * builds a prompt with optional client context and website content, calls Claude AI,
 * validates AI-cited URLs against actual SERP data, computes metrics, and persists results.
 * Supports two modes: general topic research and client-specific brand strategy.
 * Sends a completion notification to the requesting user when done.
 *
 * @auth Required (any authenticated user)
 * @body query - Search query string (required, max 500 chars)
 * @body source - Content source filter (default: 'all')
 * @body time_range - Time range filter (default: 'last_3_months')
 * @body language - Language filter (default: 'all')
 * @body country - Country filter (default: 'us')
 * @body client_id - Optional client UUID to include brand context and memory
 * @body search_mode - Search mode ('general' | 'client_strategy', default: 'general')
 * @returns {{ id: string, status: 'completed' | 'failed' }} Search record ID and final status
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

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    const role = userData?.role === 'viewer' ? 'viewer' : 'admin';
    const result = await executeTopicSearch(
      adminClient,
      {
        id: user.id,
        email: user.email,
        role,
        organizationId: userData?.organization_id ?? null,
      },
      parsed.data,
    );

    if (!result.ok) {
      if (result.reason === 'forbidden') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      if (result.reason === 'insert') {
        return NextResponse.json(
          { error: 'Failed to create search', details: result.message },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          error: 'Search failed',
          id: result.searchId,
          details: result.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: result.searchId, status: 'completed' });
  } catch (error) {
    console.error('POST /api/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
