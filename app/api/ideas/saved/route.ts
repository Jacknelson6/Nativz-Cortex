import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleInfo } from '@/lib/api/client-access';

/**
 * GET /api/ideas/saved
 *
 * List all saved ideas from the knowledge base. Returns knowledge entries of type 'idea'
 * across all clients (admin) or org-scoped clients (viewer), ordered by creation date
 * descending (max 200).
 *
 * @auth Required (any authenticated user)
 * @returns {{ ideas: KnowledgeEntry[] }} Array of saved idea entries
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Org-scope for non-admin users
  const { isAdmin, orgIds } = await getUserRoleInfo(admin, user.id);

  let query = admin
    .from('client_knowledge_entries')
    .select('id, client_id, title, content, metadata, source, created_at')
    .eq('type', 'idea')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!isAdmin) {
    // Get client IDs the viewer can access via their orgs
    const { data: accessibleClients } = await admin
      .from('clients')
      .select('id')
      .in('organization_id', orgIds);

    const clientIds = (accessibleClients ?? []).map((c) => c.id);
    if (clientIds.length === 0) {
      return NextResponse.json({ ideas: [] });
    }
    query = query.in('client_id', clientIds);
  }

  const { data } = await query;

  return NextResponse.json({ ideas: data ?? [] });
}
