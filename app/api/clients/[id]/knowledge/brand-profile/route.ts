import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';

/**
 * POST /api/clients/[id]/knowledge/brand-profile
 *
 * Generate (or regenerate) a brand profile knowledge entry for the client using AI.
 * Aggregates existing knowledge entries and client data to produce a structured profile.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @returns {{ entry: KnowledgeEntry }} The created or updated brand profile entry
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;

    // Auth check
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate brand profile
    const entry = await generateBrandProfile(clientId, user.id);

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('POST /api/clients/[id]/knowledge/brand-profile error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
