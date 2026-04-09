import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

/**
 * GET /api/search/[id]/share
 *
 * Check if a search has an active share link and return its details.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID
 * @returns {{ shared: false } | { shared: true, token: string, url: string, expires_at: string | null }}
 */
export async function GET(
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

    const adminClient = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    const { data: link } = await adminClient
      .from('search_share_links')
      .select('id, token, expires_at, created_at')
      .eq('search_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ shared: false });
    }

    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      token: link.token,
      url: `${baseUrl}/shared/search/${link.token}`,
      expires_at: link.expires_at,
    });
  } catch (error) {
    console.error('GET /api/search/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/search/[id]/share
 *
 * Create a new public share link for a completed search. Deletes any existing links
 * before generating a fresh 48-char hex token.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID (must be in 'completed' status)
 * @returns {{ shared: true, token: string, url: string }}
 */
export async function POST(
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

    const adminClient = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search as { id: string; status: string };
    if (search.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed searches can be shared' }, { status: 400 });
    }

    // Delete existing links
    await adminClient
      .from('search_share_links')
      .delete()
      .eq('search_id', id);

    const token = crypto.randomBytes(24).toString('hex');

    const { error: insertError } = await adminClient
      .from('search_share_links')
      .insert({
        search_id: id,
        token,
        created_by: user.id,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
    }

    // Use the request origin so the share URL matches the domain it was generated from
    // (AC domain → AC share URL, Nativz domain → Nativz share URL)
    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      token,
      url: `${baseUrl}/shared/search/${token}`,
    });
  } catch (error) {
    console.error('POST /api/search/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/search/[id]/share
 *
 * Revoke the public share link for a search by deleting all share records.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID
 * @returns {{ shared: false }}
 */
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
    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    await adminClient.from('search_share_links').delete().eq('search_id', id);

    return NextResponse.json({ shared: false });
  } catch (error) {
    console.error('DELETE /api/search/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
