import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandAvatar } from '@/lib/scrapers/social-avatar';

/**
 * POST /api/clients/[id]/refresh-logo
 *
 * Re-run the social-avatar resolver for an existing client and persist the
 * winning image to `clients.logo_url` + `clients.logo_source`. Pulls handles
 * from `social_profiles` first; falls back to whatever was discovered on the
 * website during the original analyze-url scrape (we don't re-scrape the
 * website here — the website URL alone is enough since `resolveFavicon` is
 * the last leg of the chain).
 *
 * @auth Required (admin)
 * @returns { logo_url, logo_source } on success, 404 when nothing usable.
 */
export async function POST(
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
    if (!userData || (userData.role !== 'admin' && userData.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: client, error: clientErr } = await adminClient
      .from('clients')
      .select('id, website_url')
      .eq('id', id)
      .single();
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Pull connected handles (one row per platform when admin has authed via
    // Zernio). `username` is the visible handle on each platform.
    const { data: profiles } = await adminClient
      .from('social_profiles')
      .select('platform, username')
      .eq('client_id', id);

    const handles: Record<string, string | undefined> = {};
    for (const p of profiles ?? []) {
      if (p?.platform && p?.username) handles[p.platform] = p.username;
    }

    const resolved = await resolveBrandAvatar({
      website: client.website_url,
      socials: {
        instagram: handles.instagram ?? null,
        facebook: handles.facebook ?? null,
        youtube: handles.youtube ?? null,
        tiktok: handles.tiktok ?? null,
      },
    });

    if (!resolved.url) {
      return NextResponse.json(
        { error: 'Could not resolve a usable avatar for this client.' },
        { status: 404 }
      );
    }

    const { error: updateErr } = await adminClient
      .from('clients')
      .update({
        logo_url: resolved.url,
        logo_source: resolved.source,
        logo_resolved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('refresh-logo update failed:', updateErr);
      return NextResponse.json({ error: 'Failed to save new logo' }, { status: 500 });
    }

    return NextResponse.json({ logo_url: resolved.url, logo_source: resolved.source });
  } catch (error) {
    console.error('POST /api/clients/[id]/refresh-logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
