import { notFound } from 'next/navigation';
import { FileUser, Users, Plug } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { IntegrationsTable } from '@/components/clients/settings/integrations-table';
import { InfoCard } from '@/components/clients/settings/info-card';
import { InfoIdentityCard } from '@/components/clients/settings/info-identity-card';
import { InfoBrandVoiceCard } from '@/components/clients/settings/info-brand-voice-card';
import { InfoBrandEssenceCard } from '@/components/clients/settings/info-brand-essence-card';
import { InfoBrandStructureCard } from '@/components/clients/settings/info-brand-structure-card';
import { InfoBrandContentPrefsCard } from '@/components/clients/settings/info-brand-content-prefs-card';
import { InfoBrandLocationCard } from '@/components/clients/settings/info-brand-location-card';
import { InfoBrandDnaSlim } from '@/components/clients/settings/info-brand-dna-slim';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

export const dynamic = 'force-dynamic';

/**
 * /admin/clients/[slug]/settings/info — the "who is this" surface.
 *
 * One scroll, no top dossier and no anchor subnav (Jack: identity already
 * lives in the first card; the subnav was visual noise on a short page).
 * Every section uses the same InfoCard chrome — Identity, Brand essence,
 * Brand voice, Brand structure, Content preferences, Default location,
 * Brand DNA, Contacts, Integrations.
 */

export default async function ClientSettingsInfoPage({
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
        'id', 'name', 'slug', 'logo_url', 'industry', 'website_url', 'agency',
        'brand_dna_status', 'uppromote_api_key',
        'brand_voice', 'target_audience', 'topic_keywords', 'description',
        'tagline', 'value_proposition', 'mission_statement',
        'products', 'brand_aliases',
        'writing_style', 'banned_phrases', 'content_language',
        'primary_country', 'primary_state', 'primary_city',
      ].join(','),
    )
    .eq('slug', slug)
    .single<{
      id: string;
      name: string | null;
      slug: string | null;
      logo_url: string | null;
      industry: string | null;
      website_url: string | null;
      agency: string | null;
      brand_dna_status: string | null;
      uppromote_api_key: string | null;
      brand_voice: string | null;
      target_audience: string | null;
      topic_keywords: string[] | null;
      description: string | null;
      tagline: string | null;
      value_proposition: string | null;
      mission_statement: string | null;
      products: string[] | null;
      brand_aliases: string[] | null;
      writing_style: string | null;
      banned_phrases: string[] | null;
      content_language: string | null;
      primary_country: string | null;
      primary_state: string | null;
      primary_city: string | null;
    }>();
  if (!client) notFound();

  type DnaRow = { updated_at: string } | null;
  const dnaRow = client.brand_dna_status && client.brand_dna_status !== 'none'
    ? await admin
      .from('client_knowledge_entries')
      .select('updated_at')
      .eq('client_id', client.id)
      .eq('type', 'brand_guideline')
      .is('metadata->superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<DnaRow>()
    : { data: null as DnaRow };

  const brandDnaUpdatedAt = dnaRow.data?.updated_at ?? null;
  const brandProfileHref = `/brand-profile?client=${encodeURIComponent(client.slug ?? slug)}`;

  // Pre-fetch contacts + invites in parallel so the contacts card paints
  // populated on first render. Portal users still hydrate client-side because
  // the existing endpoint scopes by user_client_access correctly and isn't a
  // hot path; the loading flash Jack flagged was the contacts + invites pair.
  const [contactsRes, invitesRes] = await Promise.all([
    admin
      .from('contacts')
      .select('id, client_id, name, email, phone, role, project_role, is_primary, created_at')
      .eq('client_id', client.id)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true }),
    admin
      .from('invite_tokens')
      .select('id, token, email, expires_at, used_at, used_by, created_at, created_by')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);

  const initialContacts = (contactsRes.data ?? []) as Array<{
    id: string;
    client_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    project_role: string | null;
    is_primary: boolean;
    created_at: string;
  }>;

  // Replicate /api/invites GET enrichment server-side: agency-aware base URL,
  // computed status, used_by lookup. Keeping this in lockstep with the API
  // route is the price of skipping the client-side fetch.
  const inviteRows = invitesRes.data ?? [];
  const usedByIds = inviteRows.map((i) => i.used_by).filter((u): u is string => !!u);
  const usedByMap: Record<string, { email: string; full_name: string }> = {};
  if (usedByIds.length > 0) {
    const { data: usedByUsers } = await admin
      .from('users')
      .select('id, email, full_name')
      .in('id', usedByIds);
    for (const u of usedByUsers ?? []) {
      usedByMap[u.id] = { email: u.email, full_name: u.full_name };
    }
  }

  const inviteAgency = getBrandFromAgency(client.agency);
  const inviteBaseUrl = getCortexAppUrl(inviteAgency);
  // eslint-disable-next-line react-hooks/purity -- server component, runs once per request
  const nowMs = Date.now();
  const initialInvites = inviteRows.map((inv) => {
    const expired = new Date(inv.expires_at).getTime() < nowMs;
    const status: 'used' | 'expired' | 'active' = inv.used_at
      ? 'used'
      : expired
      ? 'expired'
      : 'active';
    return {
      id: inv.id,
      token: inv.token,
      email: inv.email ?? null,
      invite_url: `${inviteBaseUrl}/join/${inv.token}`,
      status,
      expires_at: inv.expires_at,
      used_at: inv.used_at,
      used_by: inv.used_by ? usedByMap[inv.used_by] ?? null : null,
      created_at: inv.created_at,
    };
  });

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        icon={FileUser}
        title="Info"
        subtitle="Everything about this client — identity, brand, contacts, integrations."
      />

      <InfoIdentityCard
        slug={slug}
        initialClient={{
          id: client.id,
          name: client.name ?? '',
          slug: client.slug ?? slug,
          industry: client.industry,
          website_url: client.website_url,
          agency: client.agency,
          logo_url: client.logo_url,
        }}
      />

      <InfoBrandEssenceCard
        clientId={client.id}
        initial={{
          tagline: client.tagline,
          value_proposition: client.value_proposition,
          mission_statement: client.mission_statement,
        }}
      />

      <InfoBrandVoiceCard
        slug={slug}
        initial={{
          id: client.id,
          website_url: client.website_url,
          brand_voice: client.brand_voice,
          target_audience: client.target_audience,
          topic_keywords: client.topic_keywords,
          description: client.description,
        }}
      />

      <InfoBrandStructureCard
        clientId={client.id}
        initialProducts={client.products ?? []}
        initialAliases={client.brand_aliases ?? []}
      />

      <InfoBrandContentPrefsCard
        clientId={client.id}
        voiceLabel={client.brand_voice}
        initial={{
          writing_style: client.writing_style,
          banned_phrases: client.banned_phrases ?? [],
          content_language: client.content_language,
        }}
      />

      <InfoBrandLocationCard
        clientId={client.id}
        initial={{
          primary_country: client.primary_country,
          primary_state: client.primary_state,
          primary_city: client.primary_city,
        }}
      />

      <InfoBrandDnaSlim
        clientId={client.id}
        websiteUrl={client.website_url}
        brandDnaStatus={client.brand_dna_status ?? 'none'}
        brandDnaUpdatedAt={brandDnaUpdatedAt}
        brandProfileHref={brandProfileHref}
      />

      <InfoCard icon={<Users size={16} />} title="Contacts">
        <ClientContactsCard
          bare
          clientId={client.id}
          clientName={client.name ?? ''}
          initialContacts={initialContacts}
          initialInvites={initialInvites}
        />
      </InfoCard>

      <InfoCard icon={<Plug size={16} />} title="Integrations">
        <IntegrationsTable
          bare
          clientId={client.id}
          hasAffiliateIntegration={!!client.uppromote_api_key}
        />
      </InfoCard>
    </div>
  );
}
