import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotesDashboard } from '@/components/notes/notes-dashboard';
import { requireAdminWorkspaceModuleAccess } from '@/lib/clients/require-admin-workspace-module-access';

export default async function ClientNotesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminWorkspaceModuleAccess(slug, 'moodboard');

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!client) notFound();

  return (
    <NotesDashboard
      clients={[{ id: client.id, name: client.name ?? slug, slug: client.slug ?? slug }]}
      isAdmin={true}
      portalClientId={client.id}
      routePrefix="/admin"
    />
  );
}
