import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET — fetch a shared conversation by public token (no auth required) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the share link
  const { data: link } = await admin
    .from('nerd_conversation_share_links')
    .select('conversation_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'Share link not found or expired' }, { status: 404 });
  }

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
  }

  // Fetch conversation metadata
  const { data: convo } = await admin
    .from('nerd_conversations')
    .select('id, title, client_id, created_at')
    .eq('id', link.conversation_id)
    .single();

  if (!convo) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Fetch messages
  const { data: messages } = await admin
    .from('nerd_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true });

  // Fetch client name if available
  let clientName: string | null = null;
  if (convo.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', convo.client_id)
      .single();
    clientName = client?.name ?? null;
  }

  return NextResponse.json({
    conversation: {
      id: convo.id,
      title: convo.title,
      clientName,
      created_at: convo.created_at,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })),
  });
}
