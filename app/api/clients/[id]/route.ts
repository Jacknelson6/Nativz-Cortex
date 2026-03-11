import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientProfileToVault, removeClientFromVault } from '@/lib/vault/sync';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Fetch client — support both UUID (id) and slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data: dbClient } = await adminClient
      .from('clients')
      .select('id, name, slug, industry, organization_id, logo_url, website_url, target_audience, brand_voice, topic_keywords, is_active, feature_flags, health_score, agency, services, description, google_drive_branding_url, google_drive_calendars_url, preferences')
      .eq(isUuid ? 'id' : 'slug', id)
      .single();

    if (!dbClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientId = dbClient.id;

    const [
      { data: searchData },
      { data: ideasData },
      { count: ideasCount },
      contactsResult,
      { data: strategyData },
      { data: shoots },
      { data: moodboards },
    ] = await Promise.all([
      adminClient
        .from('topic_searches')
        .select('id, query, status, search_mode, created_at, approved_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(20),
      adminClient
        .from('idea_submissions')
        .select('id, title, category, status, created_at, submitted_by')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5),
      adminClient
        .from('idea_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .in('status', ['new', 'reviewed']),
      dbClient.organization_id
        ? adminClient
            .from('users')
            .select('id, full_name, email, avatar_url, job_title, last_login')
            .eq('organization_id', dbClient.organization_id)
            .eq('role', 'viewer')
            .order('full_name')
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }> }),
      adminClient
        .from('client_strategies')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('shoot_events')
        .select('id, title, shoot_date, location')
        .eq('client_id', clientId)
        .order('shoot_date', { ascending: false })
        .limit(3),
      adminClient
        .from('moodboard_boards')
        .select('id, name, created_at, updated_at')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(3),
    ]);

    return NextResponse.json({
      client: {
        id: dbClient.id,
        name: dbClient.name ?? id,
        slug: dbClient.slug,
        industry: dbClient.industry,
        logo_url: dbClient.logo_url || null,
        website_url: dbClient.website_url || null,
        target_audience: dbClient.target_audience || null,
        brand_voice: dbClient.brand_voice || null,
        topic_keywords: (dbClient.topic_keywords as string[]) || null,
        is_active: dbClient.is_active,
        feature_flags: dbClient.feature_flags || null,
        health_score: (dbClient as { health_score?: string | null }).health_score ?? null,
        agency: dbClient.agency ?? null,
        services: (dbClient.services as string[]) ?? null,
        description: dbClient.description ?? null,
        google_drive_branding_url: dbClient.google_drive_branding_url ?? null,
        google_drive_calendars_url: dbClient.google_drive_calendars_url ?? null,
        preferences: dbClient.preferences ?? null,
      },
      portalContacts: contactsResult.data || [],
      strategy: strategyData ?? null,
      searches: searchData || [],
      recentShoots: shoots || [],
      recentMoodboards: moodboards || [],
      ideas: ideasData || [],
      ideaCount: ideasCount ?? 0,
    });
  } catch (error) {
    console.error('GET /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update clients
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'industry',
      'target_audience',
      'brand_voice',
      'topic_keywords',
      'feature_flags',
      'is_active',
      'description',
      'category',
      'logo_url',
      'website_url',
      'preferences',
      'services',
      'health_score_override',
      'health_score',
      'agency',
      'google_drive_branding_url',
      'google_drive_calendars_url',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: client, error: updateError } = await adminClient
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating client:', updateError);
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
    }

    // Sync client profile to Obsidian vault (non-blocking)
    if (client) {
      syncClientProfileToVault(client).catch(() => {});
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error('PATCH /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get the client name before deleting (needed for vault cleanup)
    const { data: client } = await adminClient
      .from('clients')
      .select('name')
      .eq('id', id)
      .single();

    // Delete related records first, then the client
    await Promise.all([
      adminClient.from('topic_searches').delete().eq('client_id', id),
      adminClient.from('idea_submissions').delete().eq('client_id', id),
      adminClient.from('client_strategies').delete().eq('client_id', id),
      adminClient.from('invite_tokens').delete().eq('client_id', id),
    ]);

    const { error: deleteError } = await adminClient
      .from('clients')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting client:', deleteError);
      return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
    }

    // Remove client folder from Obsidian vault (non-blocking)
    if (client?.name) {
      removeClientFromVault(client.name).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
