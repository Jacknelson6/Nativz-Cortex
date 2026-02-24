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
      .from('moodboard_share_links')
      .select('id, token, password_hash, expires_at, created_at')
      .eq('board_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ shared: false });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      id: link.id,
      token: link.token,
      url: `${baseUrl}/shared/moodboard/${link.token}`,
      hasPassword: !!link.password_hash,
      expires_at: link.expires_at,
      created_at: link.created_at,
    });
  } catch (error) {
    console.error('GET /api/moodboard/boards/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const body = await request.json().catch(() => ({}));
    const { password, expires_at } = body as { password?: string; expires_at?: string };

    const adminClient = createAdminClient();

    // Check board exists
    const { data: board } = await adminClient
      .from('moodboard_boards')
      .select('id')
      .eq('id', id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Delete existing share links for this board
    await adminClient
      .from('moodboard_share_links')
      .delete()
      .eq('board_id', id);

    // Create new share link
    const token = crypto.randomBytes(24).toString('hex');
    const passwordHash = password
      ? crypto.createHash('sha256').update(password).digest('hex')
      : null;

    const { data: link, error: insertError } = await adminClient
      .from('moodboard_share_links')
      .insert({
        board_id: id,
        token,
        password_hash: passwordHash,
        expires_at: expires_at || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !link) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      id: link.id,
      token: link.token,
      url: `${baseUrl}/shared/moodboard/${link.token}`,
      hasPassword: !!passwordHash,
      expires_at: link.expires_at,
      created_at: link.created_at,
    });
  } catch (error) {
    console.error('POST /api/moodboard/boards/[id]/share error:', error);
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
      .from('moodboard_share_links')
      .delete()
      .eq('board_id', id);

    return NextResponse.json({ shared: false });
  } catch (error) {
    console.error('DELETE /api/moodboard/boards/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
