import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandAvatar } from '@/lib/scrapers/social-avatar';
import { scrapeSocialsFromWebsite } from '@/lib/scrapers/social-handles';

/**
 * POST /api/clients/[id]/refresh-logo
 *
 * Re-run the social-avatar resolver for an existing client and persist the
 * winning image to `clients.logo_url` + `clients.logo_source`.
 *
 * Handle sources, in priority order:
 *   1. `social_profiles` rows (set when admin connects via Zernio)
 *   2. The brand's `brand_profile.social_links` (manually entered on the
 *      Brand Profile page)
 *   3. A fresh scrape of the website HTML (mirrors analyze-url's logic)
 *
 * Falls through to favicon when none of the above yield a usable image.
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
      .select('id, website_url, brand_profile')
      .eq('id', id)
      .single();
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Step 1: connected Zernio handles (one row per platform).
    const { data: profiles } = await adminClient
      .from('social_profiles')
      .select('platform, username')
      .eq('client_id', id);

    const handles: Record<string, string | null> = {
      instagram: null,
      facebook: null,
      youtube: null,
      tiktok: null,
      linkedin: null,
    };
    for (const p of profiles ?? []) {
      if (p?.platform && p?.username && p.platform in handles) {
        handles[p.platform] = p.username;
      }
    }

    // Step 2: handles stored on the brand profile.
    const brandSocials = (client.brand_profile as { social_links?: Record<string, string> } | null)?.social_links ?? {};
    for (const platform of Object.keys(handles)) {
      if (!handles[platform] && brandSocials[platform]) {
        handles[platform] = brandSocials[platform];
      }
    }

    // Step 3: if still empty, re-scrape the website HTML for handles.
    const hasAnyHandle = Object.values(handles).some(Boolean);
    if (!hasAnyHandle && client.website_url) {
      const scraped = await scrapeSocialsFromWebsite(client.website_url);
      handles.instagram ??= scraped.instagram;
      handles.facebook ??= scraped.facebook;
      handles.youtube ??= scraped.youtube;
      handles.tiktok ??= scraped.tiktok;
      handles.linkedin ??= scraped.linkedin;
    }

    const resolved = await resolveBrandAvatar({
      website: client.website_url,
      socials: handles,
    });

    if (!resolved.url) {
      const tried: string[] = [];
      for (const [platform, handle] of Object.entries(handles)) {
        if (handle) tried.push(platform);
      }
      if (client.website_url) tried.push('favicon');
      return NextResponse.json(
        {
          error: tried.length
            ? `No usable avatar from ${tried.join(', ')}. Try connecting a social account or adding a logo manually.`
            : 'No social handles or website URL on file. Add a website or social handles first.',
        },
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
