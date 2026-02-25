/**
 * GET /api/vault/search?q=query&limit=10&mode=semantic
 *
 * Searches the vault using full-text or semantic search.
 * Falls back to full-text if semantic embeddings aren't available.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { searchVaultFTS, searchVaultSemantic } from '@/lib/vault/indexer';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get('q');
    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
    const mode = request.nextUrl.searchParams.get('mode') || 'semantic';

    const results = mode === 'fts'
      ? await searchVaultFTS(query, limit)
      : await searchVaultSemantic(query, limit);

    return NextResponse.json({
      query,
      mode: mode === 'fts' ? 'full-text' : (process.env.OPENAI_API_KEY ? 'semantic' : 'full-text-fallback'),
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('GET /api/vault/search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 },
    );
  }
}
