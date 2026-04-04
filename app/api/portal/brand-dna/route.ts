import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/portal/brand-dna
 *
 * Return the active brand guideline for the authenticated portal user's active client.
 * Respects the x-portal-active-client cookie for multi-brand support.
 *
 * @auth Required (portal user)
 * @returns {{ content, metadata, created_at, readonly: true }}
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Check active brand cookie first, fall back to user_client_access
  const cookieStore = await cookies();
  const activeClientId = cookieStore.get('x-portal-active-client')?.value;

  let clientId: string | null = null;

  if (activeClientId) {
    // Verify user has access to this client
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', activeClientId)
      .maybeSingle();

    if (access) clientId = activeClientId;
  }

  // Fallback: first accessible client
  if (!clientId) {
    const { data: firstAccess } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    clientId = firstAccess?.client_id ?? null;
  }

  if (!clientId) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }

  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata, created_at, updated_at')
    .eq('client_id', clientId)
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
