import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVaultClientBySlug } from '@/lib/vault/reader';

/**
 * GET /api/clients/vault/[id]
 *
 * Fetch a client's Obsidian vault profile by slug. The URL segment is named
 * `id` (not `slug`) because Next 15's App Router refuses to compile when
 * dynamic segments in the same subtree use different names — `app/api/clients/[id]`
 * already claims `id`. The handler still resolves a client slug string.
 *
 * @auth Required (any authenticated user)
 * @returns Client vault profile object
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: slug } = await params;
    const profile = await getVaultClientBySlug(slug);

    if (!profile) {
      return NextResponse.json({ error: 'Client not found in vault' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('GET /api/clients/vault/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
