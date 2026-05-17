import { notFound } from 'next/navigation';
import { Users2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import { TeamEditor } from '@/components/clients/profile/team-editor';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

export default async function ProfileTeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, default_strategist_id, default_editor_id')
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={Users2}
        title="Team"
        subtitle="Who on our side owns this brand's strategy + edits."
      />

      <TeamEditor
        clientId={client.id}
        initial={{
          default_strategist_id: client.default_strategist_id,
          default_editor_id: client.default_editor_id,
        }}
      />
    </>
  );
}
