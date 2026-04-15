import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

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

    // Tenant isolation honors admin impersonation: a real admin sees all,
    // but a real admin currently impersonating is scoped exactly like the
    // impersonated viewer would be. This keeps @mention autocomplete from
    // exposing cross-org clients or team_members while the banner says
    // "Viewing as ...".
    const ctx = await getEffectiveAccessContext(user, admin);

    let accessibleClientIds: string[] | null = null;
    if (ctx.role === 'viewer') {
      accessibleClientIds = ctx.clientIds ?? [];
      if (accessibleClientIds.length === 0) {
        return NextResponse.json({ clients: [], team: [] });
      }
    }

    const baseClientsQuery = admin
      .from('clients')
      .select('id, name, slug, agency, logo_url')
      .eq('is_active', true)
      .order('name');

    // Viewers (and admins impersonating) don't get team_members in the
    // autocomplete — the portal @mention surfaces don't support team
    // mentions, and returning them would leak the agency contact directory.
    const isViewer = ctx.role === 'viewer';

    const [clientsResult, teamResult] = await Promise.all([
      accessibleClientIds
        ? baseClientsQuery.in('id', accessibleClientIds)
        : baseClientsQuery,
      isViewer
        ? Promise.resolve({ data: [] as Array<{ id: string; full_name: string; role: string; avatar_url: string | null }> })
        : admin
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
