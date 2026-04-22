import { notFound } from 'next/navigation';
import { FileUser } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { GeneralSettingsForm } from '@/components/clients/settings/general-settings-form';
import { BrandSettingsForm } from '@/components/clients/settings/brand-settings-form';
import { BrandEssenceSection } from '@/components/clients/brand-essence-section';
import { LinkedSocialsSection } from '@/components/clients/linked-socials-section';
import { CompetitorsSection } from '@/components/clients/competitors-section';
import { BrandDNAView } from '@/components/brand-dna/brand-dna-view';
import { ContactsSettingsView } from '@/components/clients/settings/contacts-settings-view';
import { IntegrationsTable } from '@/components/clients/settings/integrations-table';
import {
  SettingsPageHeader,
  SettingsSectionHeader,
} from '@/components/clients/settings/settings-primitives';
import { StickySubnav } from '@/components/clients/settings/sticky-subnav';

export const dynamic = 'force-dynamic';

/**
 * /admin/clients/[slug]/settings/info — the aggregated "who is this
 * client" surface. Merges what used to be General + Brand profile +
 * Contacts + Integrations into one scrollable page with a sticky
 * anchor nav at the top so admins can jump between sub-sections
 * without hiding content behind tabs.
 *
 * Section order (matches mental model: factual → positioning → people → wiring):
 *   1. Identity          — name, slug, website, industry, agency, logo
 *   2. Brand profile     — audience, voice, keywords, essence, products
 *   3. Contacts          — company contacts + portal access
 *   4. Integrations      — social connections + UpPromote
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
    .select('id, name, slug, website_url, brand_dna_status, uppromote_api_key')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  let guideline: {
    id: string;
    content: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  } | null = null;
  if (client.brand_dna_status && client.brand_dna_status !== 'none') {
    const { data } = await admin
      .from('client_knowledge_entries')
      .select('id, content, metadata, created_at, updated_at')
      .eq('client_id', client.id)
      .eq('type', 'brand_guideline')
      .is('metadata->superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    guideline = data;
  }

  const sections = [
    { id: 'identity', label: 'Identity' },
    { id: 'brand', label: 'Brand' },
    { id: 'social', label: 'Social presence' },
    { id: 'brand-dna', label: 'Brand DNA' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'integrations', label: 'Integrations' },
  ];

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={FileUser}
        title="Info"
        subtitle="Everything about who this client is — identity, brand, contacts, integrations."
      />

      <StickySubnav sections={sections} />

      {/* 1. Identity — core name/website/agency/logo */}
      <section id="identity" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader title="Identity" />
        <GeneralSettingsForm slug={slug} embedded />
      </section>

      {/* 2. Brand profile — voice/audience/essence/products */}
      <section id="brand" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader title="Brand" />
        <BrandSettingsForm slug={slug} embedded />
        <BrandEssenceSection clientId={client.id} />
      </section>

      {/* 3. Social presence — live accounts + tracked competitors */}
      <section id="social" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Social presence"
          description="One linked account per platform unlocks analytics; tracked competitors auto-suggest in spying tools."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LinkedSocialsSection clientId={client.id} />
          <CompetitorsSection clientId={client.id} />
        </div>
      </section>

      {/* 4. Brand DNA — AI-distilled visual + verbal identity */}
      <section id="brand-dna" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Brand DNA"
          description="AI-distilled visual + verbal identity, generated from the fields above."
        />
        <BrandDNAView
          clientId={client.id}
          clientName={client.name ?? ''}
          clientSlug={client.slug ?? slug}
          websiteUrl={client.website_url ?? ''}
          brandDnaStatus={client.brand_dna_status ?? 'none'}
          guideline={guideline}
        />
      </section>

      {/* 5. Contacts — company contacts + portal users */}
      <section id="contacts" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Contacts"
          description="Company contacts and people with portal access."
        />
        <ContactsSettingsView slug={slug} embedded />
      </section>

      {/* 6. Integrations — social + UpPromote */}
      <section id="integrations" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Integrations"
          description="Connected accounts for reporting, analytics, and affiliate tracking."
        />
        <IntegrationsTable
          clientId={client.id}
          hasAffiliateIntegration={Boolean(
            (client as { uppromote_api_key?: string | null }).uppromote_api_key,
          )}
        />
      </section>
    </div>
  );
}
