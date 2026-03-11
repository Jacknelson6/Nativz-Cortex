import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET /api/nerd/mentions — Returns clients + team members for @mention autocomplete */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const [clientsResult, teamResult] = await Promise.all([
      admin
        .from('clients')
        .select('id, name, slug, agency, logo_url')
        .eq('is_active', true)
        .order('name'),
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
