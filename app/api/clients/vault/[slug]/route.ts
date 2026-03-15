import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVaultClientBySlug } from '@/lib/vault/reader';

/**
 * GET /api/clients/vault/[slug]
 *
 * Fetch a client's Obsidian vault profile by slug. Returns the parsed vault document
 * for the client, or 404 if the client is not found in the vault.
 *
 * @auth Required (any authenticated user)
 * @param slug - Client slug matching the vault document filename
 * @returns Client vault profile object
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const profile = await getVaultClientBySlug(slug);

    if (!profile) {
      return NextResponse.json({ error: 'Client not found in vault' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('GET /api/clients/vault/[slug] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
