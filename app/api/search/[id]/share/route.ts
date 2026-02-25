import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
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

    // Verify search exists and is completed
    const { data: search } = await adminClient
      .from('topic_searches')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
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
    await adminClient
      .from('search_share_links')
      .delete()
      .eq('search_id', id);

    return NextResponse.json({ shared: false });
  } catch (error) {
    console.error('DELETE /api/search/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
