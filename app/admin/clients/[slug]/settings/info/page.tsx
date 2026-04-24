import { notFound } from 'next/navigation';
import { FileUser, Link2, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { BrandSettingsForm } from '@/components/clients/settings/brand-settings-form';
import { BrandEssenceSection } from '@/components/clients/brand-essence-section';
import { ContactsSettingsView } from '@/components/clients/settings/contacts-settings-view';
import { IntegrationsTable } from '@/components/clients/settings/integrations-table';
import { ClientDossierHeader } from '@/components/clients/settings/client-dossier-header';
import { InfoIdentityCard } from '@/components/clients/settings/info-identity-card';
import { InfoBrandVoiceCard } from '@/components/clients/settings/info-brand-voice-card';
import { InfoBrandEssenceCard } from '@/components/clients/settings/info-brand-essence-card';
import { InfoBrandDnaSlim } from '@/components/clients/settings/info-brand-dna-slim';
import {
  SettingsPageHeader,
  SettingsSectionHeader,
} from '@/components/clients/settings/settings-primitives';
import { StickySubnav } from '@/components/clients/settings/sticky-subnav';

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;
type Platform = (typeof PLATFORMS)[number];

export const dynamic = 'force-dynamic';

/**
 * /admin/clients/[slug]/settings/info — the "who is this" surface, redesigned
 * around a read-first dossier pattern (cf. portal brand-profile card language).
 *
 * Section order (factual → positioning → people → wiring):
 *   0. Dossier header — logo + name + industry + 3 evidence pills (socials /
 *      competitors / Brand DNA). Read-only; edit happens below.
 *   1. Identity          — logo, website, industry, agency. Read-first.
 *   2. Brand             — essence trio (read-first edit-state), then the
 *                          existing voice/keywords form + extras (products,
 *                          aliases, content prefs, location). Social presence
 *                          + competitors are owned by the brand profile now.
 *   3. Brand DNA         — slim status placeholder. Full bento view lives
 *                          on /settings/brand and the brand-profile page.
 *                          Slated to become the Client Repo (Spec B).
 *   4. Contacts          — company contacts only. Portal users live under
 *                          Access & services.
 *   5. Integrations      — canonical home for every connected account
 *                          (socials via Zernio, UpPromote affiliate, and the
 *                          Google Business Profile etc. as they ship).
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
    }>();
  if (!client) notFound();

  // Parallelize the remaining SSR queries so the dossier pills can render
  // immediately without the client-side "—" flicker. `initialSlots` /
  // `initialCompetitorCount` flow into ClientDossierHeader; the client
  // component only re-fetches when these props are omitted.
  const [dnaRow, socialRows, competitorRows] = await Promise.all([
    client.brand_dna_status && client.brand_dna_status !== 'none'
      ? admin
        .from('client_knowledge_entries')
        .select('updated_at')
        .eq('client_id', client.id)
        .eq('type', 'brand_guideline')
        .is('metadata->superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('social_profiles')
      .select('platform, username, no_account, late_account_id')
      .eq('client_id', client.id)
      .in('platform', PLATFORMS as unknown as string[]),
    admin
      .from('competitors')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id),
  ]);

  const brandDnaUpdatedAt = (dnaRow.data as { updated_at?: string } | null)?.updated_at ?? null;

  const initialSlots = PLATFORMS.map((platform) => {
    const row = (socialRows.data ?? []).find((r) => r.platform === platform);
    if (!row) {
      return { platform, status: 'unset' as const, handle: null, zernio_connected: false };
    }
    if (row.no_account) {
      return { platform, status: 'no_account' as const, handle: null, zernio_connected: false };
    }
    return {
      platform,
      status: 'linked' as const,
      handle: row.username as string | null,
      zernio_connected: !!row.late_account_id,
    };
  }) satisfies Array<{
    platform: Platform;
    status: 'linked' | 'no_account' | 'unset';
    handle: string | null;
    zernio_connected: boolean;
  }>;
  const initialCompetitorCount = competitorRows.count ?? 0;

  const hasIdentity = !!(client.logo_url || client.industry || client.website_url || client.agency);
  const hasBrand = !!(
    client.brand_voice ||
    client.target_audience ||
    client.tagline ||
    client.value_proposition ||
    client.mission_statement ||
    (client.topic_keywords && client.topic_keywords.length > 0) ||
    client.description
  );
  const hasBrandDna = client.brand_dna_status === 'generated';
  const hasIntegrations = !!client.uppromote_api_key;

  const sections = [
    { id: 'identity', label: 'Identity', hasData: hasIdentity },
    { id: 'brand', label: 'Brand', hasData: hasBrand },
    { id: 'brand-dna', label: 'Brand DNA', hasData: hasBrandDna },
    { id: 'contacts', label: 'Contacts' },
    { id: 'integrations', label: 'Integrations', hasData: hasIntegrations },
  ];

  const brandProfileHref = `/admin/brand-profile?client=${encodeURIComponent(client.slug ?? slug)}`;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={FileUser}
        title="Info"
        subtitle="Everything about this client — identity, brand, contacts, integrations."
      />

      <ClientDossierHeader
        clientId={client.id}
        clientSlug={client.slug ?? slug}
        name={client.name ?? ''}
        industry={client.industry}
        websiteUrl={client.website_url}
        logoUrl={client.logo_url}
        brandDnaStatus={client.brand_dna_status ?? 'none'}
        brandDnaUpdatedAt={brandDnaUpdatedAt}
        brandProfileHref={brandProfileHref}
        initialSlots={initialSlots}
        initialCompetitorCount={initialCompetitorCount}
      />

      <StickySubnav sections={sections} />

      {/* 1. Identity */}
      <section id="identity" className="space-y-4 scroll-mt-24">
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
      </section>

      {/* 2. Brand — essence + voice (read-first) + extras (tag lists + prefs) */}
      <section id="brand" className="space-y-4 scroll-mt-24">
        <InfoBrandEssenceCard clientId={client.id} />
        <InfoBrandVoiceCard slug={slug} />
        <BrandSettingsForm slug={slug} embedded hideIdentityFields />
        <BrandEssenceSection clientId={client.id} skipEssence />
      </section>

      {/* 3. Brand DNA — slim status + regenerate + view link */}
      <section id="brand-dna" className="space-y-4 scroll-mt-24">
        <InfoBrandDnaSlim
          clientId={client.id}
          clientName={client.name ?? ''}
          brandDnaStatus={client.brand_dna_status ?? 'none'}
          brandDnaUpdatedAt={brandDnaUpdatedAt}
          brandProfileHref={brandProfileHref}
        />
      </section>

      {/* 4. Contacts — company only; portal users live under Access & services */}
      <section id="contacts" className="space-y-3 scroll-mt-24">
        <SettingsSectionHeader
          title="Contacts"
          description="Company contacts and roles."
        />
        <ContactsSettingsView slug={slug} embedded companyOnly />
        <div className="flex items-center gap-2 pt-1">
          <Users size={12} className="text-text-muted" />
          <span className="text-[11px] italic text-text-muted">
            Portal users and invites live under <a href={`/admin/clients/${encodeURIComponent(client.slug ?? slug)}/settings/access`} className="text-accent-text hover:underline">Access &amp; services</a>.
          </span>
        </div>
      </section>

      {/* 5. Integrations — canonical home for every connected account */}
      <section id="integrations" className="space-y-3 scroll-mt-24">
        <SettingsSectionHeader
          title="Integrations"
          description="Socials, affiliate tracking, and (soon) Google Business Profile + more — one place for every connected account."
        />
        <div className="flex items-center gap-2 pb-1">
          <Link2 size={12} className="text-text-muted" />
          <span className="text-[11px] italic text-text-muted">
            Adding a social URL here also powers scrape-based analysis when Zernio isn&apos;t connected.
          </span>
        </div>
        <IntegrationsTable
          clientId={client.id}
          hasAffiliateIntegration={!!client.uppromote_api_key}
        />
      </section>
    </div>
  );
}
