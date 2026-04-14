import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/nerd/mentions
 *
 * Return all active clients and team members for @mention autocomplete in The Nerd chat.
 * Returns both entities in a single response to minimize round-trips.
 *
 * @auth Required (any authenticated user)
 * @returns {{ clients: MentionClient[], team: MentionTeamMember[] }}
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Tenant isolation: viewers only see clients their org has access to.
    // Admins see everything (needed for the Nerd @mention autocomplete).
    const { data: userData } = await admin
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    let accessibleClientIds: string[] | null = null;
    if (userData?.role === 'viewer') {
      const { data: accessRows } = await admin
        .from('user_client_access')
        .select('client_id')
        .eq('user_id', user.id);
      accessibleClientIds = (accessRows ?? []).map((r) => r.client_id as string);
      if (accessibleClientIds.length === 0) {
        return NextResponse.json({ clients: [], team: [] });
      }
    }

    const baseClientsQuery = admin
      .from('clients')
      .select('id, name, slug, agency, logo_url')
      .eq('is_active', true)
      .order('name');

    const [clientsResult, teamResult] = await Promise.all([
      accessibleClientIds
        ? baseClientsQuery.in('id', accessibleClientIds)
        : baseClientsQuery,
      admin
        .from('team_members')
        .select('id, full_name, email, role, avatar_url')
        .eq('is_active', true)
        .order('full_name'),
    ]);

    const clients = (clientsResult.data ?? []).map((c) => ({
      type: 'client' as const,
      id: c.id,
      name: c.name,
      slug: c.slug,
      agency: c.agency,
      avatarUrl: c.logo_url,
    }));

    const team = (teamResult.data ?? []).map((t) => ({
      type: 'team_member' as const,
      id: t.id,
      name: t.full_name,
      role: t.role,
      avatarUrl: t.avatar_url,
    }));

    return NextResponse.json({ clients, team });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch mentions data' }, { status: 500 });
  }
}
