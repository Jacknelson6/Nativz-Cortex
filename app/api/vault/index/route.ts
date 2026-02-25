/**
 * POST /api/vault/index
 *
 * Indexes the entire vault into the search database.
 * Call this once to bootstrap, then the webhook handles incremental updates.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { indexEntireVault } from '@/lib/vault/indexer';

export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await indexEntireVault();

    return NextResponse.json({
      message: `Indexed ${result.results.length} files (${result.total} chunks)`,
      hasEmbeddings: !!process.env.OPENAI_API_KEY,
      results: result.results,
    });
  } catch (error) {
    console.error('POST /api/vault/index error:', error);
    return NextResponse.json(
      { error: 'Failed to index vault' },
      { status: 500 },
    );
  }
}
