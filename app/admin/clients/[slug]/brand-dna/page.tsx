import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { BrandDNAView } from '@/components/brand-dna/brand-dna-view';
import { requireAdminWorkspaceModuleAccess } from '@/lib/clients/require-admin-workspace-module-access';

export default async function BrandDNAPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminWorkspaceModuleAccess(slug, 'brand-dna');

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, website_url, brand_dna_status')
    .eq('slug', slug)
    .single();

  if (!client) notFound();

  // Fetch active brand guideline if exists
  let guideline = null;
  if (client.brand_dna_status !== 'none') {
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
    <BrandDNAView
      clientId={client.id}
      clientName={client.name ?? ''}
      clientSlug={client.slug ?? slug}
      websiteUrl={client.website_url ?? ''}
      brandDnaStatus={client.brand_dna_status ?? 'none'}
      guideline={guideline}
    />
  );
}
