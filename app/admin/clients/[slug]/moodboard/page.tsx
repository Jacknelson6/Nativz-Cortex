import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientMoodboardEmpty } from '@/components/clients/client-moodboard-empty';

export default async function ClientMoodboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!client) {
    notFound();
  }

  const { data: board } = await admin
    .from('moodboard_boards')
    .select('id')
    .eq('client_id', client.id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (board?.id) {
    redirect(`/admin/analysis/${board.id}`);
  }

  return (
    <ClientMoodboardEmpty
      clientId={client.id}
      clientName={client.name ?? slug}
    />
  );
}
