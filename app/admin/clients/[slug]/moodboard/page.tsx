import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientMoodboardEmpty } from '@/components/clients/client-moodboard-empty';
import { ClientMoodboardWorkspace } from '@/components/clients/client-moodboard-workspace';
import { requireAdminWorkspaceModuleAccess } from '@/lib/clients/require-admin-workspace-module-access';

export default async function ClientMoodboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminWorkspaceModuleAccess(slug, 'moodboard');

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
    return <ClientMoodboardWorkspace boardId={board.id} clientSlug={slug} />;
  }

  return (
    <ClientMoodboardEmpty
      clientId={client.id}
      clientName={client.name ?? slug}
    />
  );
}
