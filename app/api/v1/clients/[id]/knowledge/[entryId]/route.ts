import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/clients/[id]/knowledge/[entryId]
 *
 * Fetch a single knowledge entry by ID, scoped to the given client.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Client UUID
 * @param entryId - Knowledge entry UUID
 * @returns {{ entry: KnowledgeEntry }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId, entryId } = await params;

    const admin = createAdminClient();
    const { data: entry, error } = await admin
      .from('client_knowledge_entries')
      .select('*')
      .eq('id', entryId)
      .eq('client_id', clientId)
      .single();

    if (error || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('GET /api/v1/clients/[id]/knowledge/[entryId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
