/**
 * POST /api/vault/index
 *
 * Full re-index of the entire GitHub-backed Obsidian vault into the search
 * database. Use this once to bootstrap search; the webhook handles incremental
 * updates after that. Max function duration: 60s.
 *
 * @auth Required (any authenticated user)
 * @returns {{ message: string, hasEmbeddings: boolean, results: IndexResult[] }}
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
