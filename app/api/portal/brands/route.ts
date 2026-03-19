/**
 * GET /api/portal/brands
 *
 * Returns all client brands the authenticated user has access to
 * via the user_client_access junction table.
 *
 * @auth Required (viewer or admin)
 * @returns {{ brands: Array<{ id, name, slug, agency, logo_url, organization_id }> }}
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get all clients this user has access to
    const { data: accessRows, error } = await adminClient
      .from('user_client_access')
      .select('client_id, organization_id')
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to fetch user_client_access:', error);
      return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 });
    }

    if (!accessRows || accessRows.length === 0) {
      return NextResponse.json({ brands: [] });
    }

    const clientIds = accessRows.map((r) => r.client_id);

    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name, slug, agency, logo_url, organization_id')
      .in('id', clientIds)
      .eq('is_active', true)
      .order('name');

    return NextResponse.json({
      brands: (clients ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        agency: c.agency ?? null,
        logo_url: c.logo_url ?? null,
        organization_id: c.organization_id,
      })),
    });
  } catch (error) {
    console.error('GET /api/portal/brands error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
