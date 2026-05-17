import { notFound } from 'next/navigation';
import { Users2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';
import { TeamEditor } from '@/components/clients/profile/team-editor';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

type Member = { id: string; full_name: string | null; email: string };

function memberLabel(m: Member | null): string | null {
  if (!m) return null;
  const name = (m.full_name ?? '').trim();
  return name || m.email || 'Unnamed';
}

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

  const memberIds = [client.default_strategist_id, client.default_editor_id].filter(
    (v): v is string => Boolean(v),
  );

  let memberMap = new Map<string, Member>();
  if (memberIds.length > 0) {
    const { data: members } = await admin
      .from('team_members')
      .select('id, full_name, email')
      .in('id', memberIds);
    memberMap = new Map((members ?? []).map((m) => [m.id, m as Member]));
  }

  const strategist = client.default_strategist_id
    ? memberMap.get(client.default_strategist_id) ?? null
    : null;
  const editor = client.default_editor_id
    ? memberMap.get(client.default_editor_id) ?? null
    : null;

  return (
    <>
      <SettingsPageHeader
        icon={Users2}
        title="Team"
        subtitle="Who on our side owns this brand's strategy + edits."
      />

      <WorkspaceSection
        title="Default assignments"
        description="Picked at the brand level so every new editing project + monthly calendar drop auto-fills the right humans."
        action={
          <TeamEditor
            clientId={client.id}
            initial={{
              default_strategist_id: client.default_strategist_id,
              default_editor_id: client.default_editor_id,
            }}
          />
        }
      >
        <WorkspaceRow
          label="Strategist"
          value={memberLabel(strategist)}
          hint="Owns research, briefs, and approvals."
        />
        <WorkspaceRow
          label="Editor"
          value={memberLabel(editor)}
          hint="Owns the cut, posts, and project hand-off."
        />
      </WorkspaceSection>
    </>
  );
}
