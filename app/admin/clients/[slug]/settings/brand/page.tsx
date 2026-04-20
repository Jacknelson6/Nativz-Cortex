import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { BrandSettingsForm } from '@/components/clients/settings/brand-settings-form';
import { BrandDNAView } from '@/components/brand-dna/brand-dna-view';

export const dynamic = 'force-dynamic';

export default async function ClientSettingsBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, website_url, brand_dna_status')
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

  return (
    <div className="space-y-10">
      <BrandSettingsForm slug={slug} />
      <div className="border-t border-nativz-border pt-8">
        <BrandDNAView
          clientId={client.id}
          clientName={client.name ?? ''}
          clientSlug={client.slug ?? slug}
          websiteUrl={client.website_url ?? ''}
          brandDnaStatus={client.brand_dna_status ?? 'none'}
          guideline={guideline}
        />
      </div>
    </div>
  );
}
