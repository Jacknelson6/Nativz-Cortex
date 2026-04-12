import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

/** POST — create a share link for a conversation */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Verify admin
  const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Verify conversation exists
  const { data: convo } = await admin
    .from('nerd_conversations')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // Delete existing links and create fresh token
  await admin.from('nerd_conversation_share_links').delete().eq('conversation_id', id);

  const token = crypto.randomBytes(24).toString('hex');
  const { error: insertError } = await admin
    .from('nerd_conversation_share_links')
    .insert({ conversation_id: id, token, created_by: user.id });

  if (insertError) {
    console.error('Failed to create conversation share link:', insertError);
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }

  const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  return NextResponse.json({
    shared: true,
    token,
    url: `${baseUrl}/shared/nerd/${token}`,
  });
}

/** GET — check if a conversation has an active share link */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('nerd_conversation_share_links')
    .select('token, expires_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!link) return NextResponse.json({ shared: false });

  const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  return NextResponse.json({
    shared: true,
    token: link.token,
    url: `${baseUrl}/shared/nerd/${link.token}`,
    expires_at: link.expires_at,
  });
}

/** DELETE — revoke share link */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  await admin.from('nerd_conversation_share_links').delete().eq('conversation_id', id);
  return NextResponse.json({ shared: false });
}
