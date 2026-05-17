import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientLogo } from '@/components/clients/client-logo';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  name: string | null;
  slug: string | null;
  industry: string | null;
  website_url: string | null;
  agency: string | null;
  logo_url: string | null;
  lifecycle_state: string | null;
  description: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  caption_cta: string | null;
  caption_hashtags: string[] | null;
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

const LIFECYCLE_LABEL: Record<string, string> = {
  lead: 'Lead',
  contracted: 'Contracted',
  paid_deposit: 'Deposit paid',
  active: 'Active',
  churned: 'Churned',
};

function preview(value: string | null, max = 140): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

export default async function ProfileOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select(
      [
        'id', 'name', 'slug', 'industry', 'website_url', 'agency', 'logo_url',
        'lifecycle_state', 'description', 'brand_voice', 'target_audience',
        'caption_cta', 'caption_hashtags',
        'default_strategist_id', 'default_editor_id',
      ].join(','),
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  const assigneeIds = [client.default_strategist_id, client.default_editor_id]
    .filter((id): id is string => !!id);

  const [
    teamRes,
    contactsRes,
    invitesRes,
    assetsRes,
    onboardingsRes,
  ] = await Promise.all([
    assigneeIds.length > 0
      ? admin.from('team_members').select('id, full_name, email').in('id', assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    admin.from('contacts').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    admin.from('invite_tokens').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    admin.from('client_brand_assets').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    admin.from('onboardings').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
  ]);

  const teamMap = new Map<string, { name: string }>();
  for (const m of (teamRes.data ?? [])) {
    teamMap.set(m.id, { name: m.full_name?.trim() || m.email });
  }
  const strategist = client.default_strategist_id
    ? teamMap.get(client.default_strategist_id)?.name ?? null
    : null;
  const editor = client.default_editor_id
    ? teamMap.get(client.default_editor_id)?.name ?? null
    : null;

  const contactsCount = contactsRes.count ?? 0;
  const invitesCount = invitesRes.count ?? 0;
  const assetsCount = assetsRes.count ?? 0;
  const onboardingsCount = onboardingsRes.count ?? 0;

  const lifecycleLabel = client.lifecycle_state
    ? LIFECYCLE_LABEL[client.lifecycle_state] ?? client.lifecycle_state
    : null;

  const hashtagCount = (client.caption_hashtags ?? []).filter((h) => h.trim().length > 0).length;

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={Eye}
        title="Overview"
        subtitle="A single read of who they are, what we ship, and who's on the account. Jump to a section in the rail to edit."
      />

      <WorkspaceSection
        title="Identity"
        description="The bare facts a new strategist needs to load this brand in their head."
      >
        <WorkspaceRow label="Brand name" value={client.name} />
        <WorkspaceRow label="Website" value={cleanUrl(client.website_url)} />
        <WorkspaceRow label="Industry" value={client.industry} />
        <WorkspaceRow label="Lifecycle" value={lifecycleLabel} />
        <WorkspaceRow label="Agency" value={client.agency} />
        <WorkspaceRow
          label="Logo"
          rightSlot={
            <ClientLogo
              src={client.logo_url}
              name={client.name ?? slug}
              size="md"
            />
          }
        />
        <WorkspaceRow
          label="Description"
          value={preview(client.description, 220)}
          multiline
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Voice & captions"
        description="The guardrails the AI uses when drafting topic plans, scripts and captions."
      >
        <WorkspaceRow
          label="Brand voice"
          value={preview(client.brand_voice, 180)}
          multiline
        />
        <WorkspaceRow
          label="Target audience"
          value={preview(client.target_audience, 180)}
          multiline
        />
        <WorkspaceRow label="Caption CTA" value={preview(client.caption_cta, 140)} />
        <WorkspaceRow
          label="Hashtags"
          value={hashtagCount > 0 ? `${hashtagCount} saved` : null}
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="People"
        description="Who runs this client on our side, plus everyone with portal access."
      >
        <WorkspaceRow label="Strategist" value={strategist} />
        <WorkspaceRow label="Editor" value={editor} />
        <WorkspaceRow
          label="Users"
          hint="Contacts + portal access"
          value={
            contactsCount > 0 || invitesCount > 0
              ? `${contactsCount} contact${contactsCount === 1 ? '' : 's'} · ${invitesCount} invite${invitesCount === 1 ? '' : 's'}`
              : null
          }
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Operations"
        description="Files, history, and the running tally of work in flight."
      >
        <WorkspaceRow
          label="Brand assets"
          value={assetsCount > 0 ? `${assetsCount} file${assetsCount === 1 ? '' : 's'}` : null}
        />
        <WorkspaceRow
          label="Onboardings"
          value={
            onboardingsCount > 0
              ? `${onboardingsCount} run${onboardingsCount === 1 ? '' : 's'}`
              : null
          }
          empty="None started"
        />
      </WorkspaceSection>
    </>
  );
}
