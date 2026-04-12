import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { SharedNerdClient } from './shared-nerd-client';

export default async function SharedNerdPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  // Look up share link
  const { data: link } = await admin
    .from('nerd_conversation_share_links')
    .select('conversation_id, expires_at')
    .eq('token', token)
    .single();

  if (!link) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  // Fetch conversation
  const { data: convo } = await admin
    .from('nerd_conversations')
    .select('id, title, client_id, created_at')
    .eq('id', link.conversation_id)
    .single();

  if (!convo) notFound();

  // Fetch messages
  const { data: messages } = await admin
    .from('nerd_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true });

  // Fetch client name
  let clientName: string | null = null;
  if (convo.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', convo.client_id)
      .single();
    clientName = client?.name ?? null;
  }

  return (
    <SharedNerdClient
      title={convo.title ?? 'Nerd conversation'}
      clientName={clientName}
      createdAt={convo.created_at}
      messages={(messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))}
    />
  );
}
