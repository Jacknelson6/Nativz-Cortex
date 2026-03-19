import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/portal/brand-dna
 *
 * Return the active brand guideline for the authenticated portal user's organization.
 * Read-only — portal users cannot edit.
 *
 * @auth Required (portal user)
 * @returns {{ content, metadata, created_at, readonly: true }}
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Get user's organization to find client
  const { data: userData } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!userData?.organization_id) {
    return NextResponse.json({ error: 'No organization found' }, { status: 403 });
  }

  // Find client linked to this organization
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('organization_id', userData.organization_id)
    .limit(1)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'No client found for this organization' }, { status: 404 });
  }

  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata, created_at, updated_at')
    .eq('client_id', client.id)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guideline) {
    return NextResponse.json({ error: 'No brand guideline found' }, { status: 404 });
  }

  return NextResponse.json({
    id: guideline.id,
    content: guideline.content,
    metadata: guideline.metadata,
    created_at: guideline.created_at,
    updated_at: guideline.updated_at,
    readonly: true,
  });
}
