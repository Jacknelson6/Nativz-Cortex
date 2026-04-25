import { notFound } from 'next/navigation';
import { FileUser, Users, Plug } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
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
        'writing_style', 'ai_image_style', 'banned_phrases', 'content_language',
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
      ai_image_style: string | null;
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
          ai_image_style: client.ai_image_style,
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
