import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/brand-dna/versions
 *
 * Return version history for the brand guideline.
 *
 * @auth Required
 * @returns {{ versions: { id, version, created_at, superseded_by }[] }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: entries } = await admin
    .from('client_knowledge_entries')
    .select('id, metadata, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .order('created_at', { ascending: false })
    .limit(20);

  const versions = (entries ?? []).map((e) => {
    const meta = (e.metadata as Record<string, unknown>) ?? {};
    return {
      id: e.id,
      version: (meta.version as number) ?? 1,
      created_at: e.created_at,
      updated_at: e.updated_at,
      superseded_by: (meta.superseded_by as string) ?? null,
      is_active: !meta.superseded_by,
    };
  });

  return NextResponse.json({ versions });
}
