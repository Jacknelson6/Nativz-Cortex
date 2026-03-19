import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';

/**
 * POST /api/clients/[id]/brand-dna/section/[section]/verify
 *
 * Mark a Brand DNA section as verified by the admin.
 *
 * @auth Required (admin)
 * @param section - Section heading (URL-encoded)
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; section: string }> },
) {
  const { id: clientId, section } = await params;
  const sectionName = decodeURIComponent(section);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guideline) {
    return NextResponse.json({ error: 'No brand guideline found' }, { status: 404 });
  }

  const meta = (guideline.metadata as Record<string, unknown>) ?? {};
  const verified = (meta.verified_sections as Record<string, unknown>) ?? {};

  verified[sectionName] = {
    verified_at: new Date().toISOString(),
    verified_by: user.id,
  };

  await admin
    .from('client_knowledge_entries')
    .update({
      metadata: { ...meta, verified_sections: verified },
      updated_at: new Date().toISOString(),
    })
    .eq('id', guideline.id);

  invalidateBrandContext(clientId);
  return NextResponse.json({ success: true });
}
